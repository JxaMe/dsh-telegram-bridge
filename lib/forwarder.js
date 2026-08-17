export class EventForwarder {
    ctx;
    bot;
    state;
    pending;
    queue;
    onPendingClear;
    htmlFormatting;
    constructor(ctx, bot, state, pending, queue, onPendingClear, htmlFormatting = true) {
        this.ctx = ctx;
        this.bot = bot;
        this.state = state;
        this.pending = pending;
        this.queue = queue;
        this.onPendingClear = onPendingClear;
        this.htmlFormatting = htmlFormatting;
    }
    start() {
        this.ctx.on('session/event', (session, event) => {
            const evt = event;
            if (evt?.type !== 'assistant/message')
                return;
            const sessionRecord = session;
            const sessionId = typeof sessionRecord?.id === 'string' ? sessionRecord.id : undefined;
            if (!sessionId)
                return;
            const chatId = this.findChatId(sessionId);
            if (chatId === undefined)
                return;
            const data = evt.data ?? {};
            const text = extractText(data.message?.content ?? data.content);
            this.state.addAssistantMessage(chatId, data.usage);
            const chatState = this.state.getChatState(chatId);
            if (chatState) {
                this.state.setChatState(chatId, { ...chatState, lastActiveAt: Date.now() });
            }
            if (!text)
                return;
            void this.sendToTelegram(chatId, text);
        });
    }
    findChatId(sessionId) {
        const state = this.state.loadState();
        for (const [chatId, chat] of Object.entries(state.chats)) {
            if (chat.sessionId === sessionId)
                return Number(chatId);
        }
        return undefined;
    }
    async sendToTelegram(chatId, text) {
        await this.pending.clear(this.bot, chatId);
        const chunks = splitTelegramMessage(text);
        for (const chunk of chunks) {
            try {
                await this.bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
            }
            catch {
                await this.bot.api.sendMessage(chatId, chunk);
            }
        }
        if (this.queue.queueLength(chatId) > 0) {
            const sent = await this.bot.api.sendMessage(chatId, '🐋 Deep diving...');
            this.pending.set(this.bot, chatId, sent.message_id, this.queue.queueLength(chatId));
        }
    }
}
function extractText(content) {
    if (!Array.isArray(content))
        return '';
    return content
        .filter(isTextBlock)
        .map((block) => String(block.text ?? ''))
        .join('\n')
        .trim();
}
function isTextBlock(block) {
    if (typeof block !== 'object' || block === null)
        return false;
    return block.type === 'text';
}
const FENCED_BLOCK_RE = /```([^\n`]*)[ \t]*\n([\s\S]*?)```/g;
export function formatTelegramHtml(text) {
    return renderBlocks(toBlocks(text));
}
export function splitTelegramMessage(text, limit = 4096) {
    return chunkBlocks(toBlocks(text), limit);
}
export function splitPlainMessage(text, limit = 4096) {
    const chunks = [];
    for (let i = 0; i < text.length; i += limit) {
        chunks.push(text.slice(i, i + limit));
    }
    return chunks.length > 0 ? chunks : [''];
}
function toBlocks(text) {
    const blocks = [];
    let plainStart = 0;
    let match;
    FENCED_BLOCK_RE.lastIndex = 0;
    while ((match = FENCED_BLOCK_RE.exec(text)) !== null) {
        if (match.index > plainStart) {
            pushPlain(blocks, text.slice(plainStart, match.index));
        }
        const lang = match[1]?.trim() ?? '';
        const raw = match[2]?.replace(/\n$/, '') ?? '';
        if (lang === 'dsh-ui') {
            try {
                const data = JSON.parse(raw.trim());
                blocks.push({ type: 'html', html: renderDshUi(data) });
            }
            catch {
                blocks.push({ type: 'code', lang: 'dsh-ui', text: raw });
            }
        }
        else {
            blocks.push({ type: 'code', lang, text: raw });
        }
        plainStart = match.index + match[0].length;
    }
    if (plainStart < text.length) {
        pushPlain(blocks, text.slice(plainStart));
    }
    if (blocks.length === 0) {
        blocks.push({ type: 'plain', text });
    }
    return blocks;
}
function pushPlain(blocks, text) {
    if (!text)
        return;
    const last = blocks[blocks.length - 1];
    if (last?.type === 'plain') {
        last.text = (last.text ?? '') + text;
    }
    else {
        blocks.push({ type: 'plain', text });
    }
}
function renderBlocks(blocks) {
    return blocks.map(renderBlock).filter(Boolean).join('\n');
}
function formatPlainText(text) {
    const parts = [];
    let last = 0;
    const re = /`([^`]+)`|(https?:\/\/[^\s<>()"]+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
            parts.push(escapeHtml(text.slice(last, m.index)));
        }
        if (m[1] !== undefined) {
            // Inline code
            parts.push(`<code>${escapeHtml(m[1])}</code>`);
        }
        else {
            // Safe URL
            const url = m[2];
            parts.push(`<a href="${url}">${escapeHtml(url)}</a>`);
        }
        last = m.index + m[0].length;
    }
    if (last < text.length) {
        parts.push(escapeHtml(text.slice(last)));
    }
    return parts.join('');
}
function renderBlock(block) {
    switch (block.type) {
        case 'plain':
            return formatPlainText(block.text ?? '');
        case 'code':
            return renderCodeBlock(block);
        case 'html':
            return block.html ?? '';
        default:
            return '';
    }
}
function renderCodeBlock(block) {
    const language = block.lang ? `<code>${escapeHtml(block.lang)}</code>\n` : '';
    return `<pre>${language}${escapeHtml(block.text ?? '')}</pre>`;
}
function chunkBlocks(blocks, limit) {
    const chunks = [];
    let current = '';
    const flush = () => {
        if (current.length > 0) {
            chunks.push(current);
            current = '';
        }
    };
    for (const block of blocks) {
        if (block.type === 'plain') {
            const lines = (block.text ?? '').split('\n');
            for (const line of lines) {
                const renderedLine = formatPlainText(line);
                if (line.length > limit) {
                    flush();
                    for (let i = 0; i < line.length; i += limit) {
                        chunks.push(formatPlainText(line.slice(i, i + limit)));
                    }
                    continue;
                }
                if (current.length > 0 && current.length + renderedLine.length + 1 > limit) {
                    flush();
                }
                current += (current.length > 0 ? '\n' : '') + renderedLine;
            }
            continue;
        }
        if (block.type === 'code') {
            const html = renderCodeBlock(block);
            if (html.length <= limit) {
                if (current.length > 0 && current.length + html.length + 1 > limit) {
                    flush();
                }
                current += (current.length > 0 ? '\n' : '') + html;
            }
            else {
                flush();
                const lines = (block.text ?? '').split('\n');
                let sub = [];
                let subTextLength = 0;
                const flushCodeChunk = () => {
                    if (sub.length === 0)
                        return;
                    chunks.push(renderCodeBlock({ type: 'code', lang: block.lang, text: sub.join('\n') }));
                    sub = [];
                    subTextLength = 0;
                };
                for (const line of lines) {
                    const estimated = escapeHtml(line).length + 8;
                    if (sub.length > 0 && subTextLength + estimated + 1 > limit) {
                        flushCodeChunk();
                    }
                    sub.push(line);
                    subTextLength += line.length;
                }
                flushCodeChunk();
            }
            continue;
        }
        // Pre-rendered HTML block (dsh-ui). Keep it atomic when possible.
        const html = block.html ?? '';
        if (html.length <= limit) {
            if (current.length > 0 && current.length + html.length + 1 > limit) {
                flush();
            }
            current += (current.length > 0 ? '\n' : '') + html;
        }
        else {
            flush();
            for (let i = 0; i < html.length; i += limit) {
                chunks.push(html.slice(i, i + limit));
            }
        }
    }
    flush();
    return chunks.length > 0 ? chunks : [''];
}
function renderDshUi(data) {
    const record = asRecord(data);
    if (!record)
        return '';
    const parts = [];
    const title = record.title;
    if (typeof title === 'string' && title.trim()) {
        parts.push(`<b>${escapeHtml(title)}</b>`);
    }
    const items = Array.isArray(record.items) ? record.items : [];
    for (const item of items) {
        const rendered = renderDshUiItem(item);
        if (rendered)
            parts.push(rendered);
    }
    return parts.join('\n\n');
}
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : null;
}
function renderDshUiItem(item) {
    const record = asRecord(item);
    if (!record)
        return '';
    switch (record.type) {
        case 'keyvalue': {
            const pairs = Array.isArray(record.pairs) ? record.pairs : [];
            return pairs
                .filter((pair) => asRecord(pair) !== null)
                .map((pair) => `<b>${escapeHtml(String(pair.key ?? ''))}</b>: ${escapeHtml(String(pair.value ?? ''))}`)
                .join('\n');
        }
        case 'callout': {
            const icon = calloutIcon(record.tone);
            const title = typeof record.title === 'string' && record.title.trim() ? `${icon} ${record.title}` : icon;
            const content = typeof record.content === 'string' ? record.content : '';
            return `<b>${escapeHtml(title)}</b>\n${escapeHtml(content)}`;
        }
        case 'text':
            return escapeHtml(typeof record.content === 'string' ? record.content : typeof record.text === 'string' ? record.text : '');
        case 'list': {
            const values = Array.isArray(record.items) ? record.items : [];
            return values.map((value) => `• ${escapeHtml(String(value))}`).join('\n');
        }
        case 'steps': {
            const steps = Array.isArray(record.items) ? record.items : [];
            return steps.map((step, index) => `${index + 1}. ${escapeHtml(String(step))}`).join('\n');
        }
        default:
            return '';
    }
}
function calloutIcon(tone) {
    switch (tone) {
        case 'success': return '✅';
        case 'info': return 'ℹ️';
        case 'warning': return '⚠️';
        case 'error': return '❌';
        default: return '💬';
    }
}
export function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
