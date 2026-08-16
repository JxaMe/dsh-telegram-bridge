export class EventForwarder {
    ctx;
    bot;
    state;
    pending;
    queue;
    constructor(ctx, bot, state, pending, queue) {
        this.ctx = ctx;
        this.bot = bot;
        this.state = state;
        this.pending = pending;
        this.queue = queue;
    }
    start() {
        this.ctx.on('session/event', (session, event) => {
            if (event?.type !== 'assistant/message')
                return;
            const sessionId = session?.id;
            if (!sessionId)
                return;
            const chatId = this.findChatId(sessionId);
            if (chatId === undefined)
                return;
            const text = extractText(event.data?.message?.content ?? event.data?.content);
            this.state.addAssistantMessage(chatId, event.data?.usage);
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
        const formatted = formatDshUi(text);
        const chunks = splitMessage(formatted);
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
            this.pending.set(this.bot, chatId, sent.message_id);
        }
    }
}
function extractText(content) {
    if (!Array.isArray(content))
        return '';
    return content
        .filter((block) => block?.type === 'text')
        .map((block) => String(block.text ?? ''))
        .join('\n')
        .trim();
}
function splitMessage(text, limit = 4096) {
    const chunks = [];
    for (let i = 0; i < text.length; i += limit) {
        chunks.push(text.slice(i, i + limit));
    }
    return chunks.length > 0 ? chunks : [''];
}
const DSH_UI_FENCE_RE = /```dsh-ui\s*\n([\s\S]*?)```/g;
function formatDshUi(text) {
    if (!text.includes('dsh-ui'))
        return text;
    return text.replace(DSH_UI_FENCE_RE, (_full, json) => {
        try {
            const data = JSON.parse(json.trim());
            return renderDshUi(data);
        }
        catch {
            return _full;
        }
    });
}
function renderDshUi(data) {
    const parts = [];
    if (typeof data?.title === 'string' && data.title.trim()) {
        parts.push(`<b>${escapeHtml(data.title)}</b>`);
    }
    const items = Array.isArray(data?.items) ? data.items : [];
    for (const item of items) {
        const rendered = renderDshUiItem(item);
        if (rendered)
            parts.push(rendered);
    }
    return parts.join('\n\n');
}
function renderDshUiItem(item) {
    if (!item || typeof item !== 'object')
        return '';
    switch (item.type) {
        case 'keyvalue': {
            const pairs = Array.isArray(item.pairs) ? item.pairs : [];
            return pairs
                .filter((pair) => pair && typeof pair === 'object')
                .map((pair) => `<b>${escapeHtml(String(pair.key ?? ''))}</b>: ${escapeHtml(String(pair.value ?? ''))}`)
                .join('\n');
        }
        case 'callout': {
            const icon = calloutIcon(item.tone);
            const title = typeof item.title === 'string' && item.title.trim() ? `${icon} ${item.title}` : icon;
            const content = typeof item.content === 'string' ? item.content : '';
            return `<b>${escapeHtml(title)}</b>\n${escapeHtml(content)}`;
        }
        case 'text':
            return escapeHtml(typeof item.content === 'string' ? item.content : typeof item.text === 'string' ? item.text : '');
        case 'list': {
            const values = Array.isArray(item.items) ? item.items : [];
            return values.map((value) => `• ${escapeHtml(String(value))}`).join('\n');
        }
        case 'steps': {
            const steps = Array.isArray(item.items) ? item.items : [];
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
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
