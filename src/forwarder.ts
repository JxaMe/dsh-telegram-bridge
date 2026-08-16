import type { Bot } from 'grammy';
import type { DshContext } from './dsh-types.js';
import type { PendingStatus } from './pending-status.js';
import type { QueueManager } from './queue.js';
import type { StateStore } from './state.js';

export class EventForwarder {
  constructor(
    private ctx: DshContext,
    private bot: Bot,
    private state: StateStore,
    private pending: PendingStatus,
    private queue: QueueManager,
  ) {}

  start(): void {
    this.ctx.on('session/event', (session: any, event: any) => {
      if (event?.type !== 'assistant/message') return;
      const sessionId: string | undefined = session?.id;
      if (!sessionId) return;
      const chatId = this.findChatId(sessionId);
      if (chatId === undefined) return;
      const text = extractText(event.data?.message?.content ?? event.data?.content);
      this.state.addAssistantMessage(chatId, event.data?.usage);
      if (!text) return;
      void this.sendToTelegram(chatId, text);
    });
  }

  private findChatId(sessionId: string): number | undefined {
    const state = this.state.loadState();
    for (const [chatId, chat] of Object.entries(state.chats)) {
      if (chat.sessionId === sessionId) return Number(chatId);
    }
    return undefined;
  }

  private async sendToTelegram(chatId: number, text: string): Promise<void> {
    await this.pending.clear(this.bot, chatId);
    const chunks = splitTelegramMessage(text);
    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
      } catch {
        await this.bot.api.sendMessage(chatId, chunk);
      }
    }
    if (this.queue.queueLength(chatId) > 0) {
      const sent = await this.bot.api.sendMessage(chatId, '🐋 Deep diving...');
      this.pending.set(this.bot, chatId, sent.message_id);
    }
  }
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block: any) => block?.type === 'text')
    .map((block: any) => String(block.text ?? ''))
    .join('\n')
    .trim();
}

interface TextBlock {
  type: 'plain' | 'code' | 'html';
  text?: string;
  lang?: string;
  html?: string;
}

const FENCED_BLOCK_RE = /```([^\n`]*)[ \t]*\n([\s\S]*?)```/g;

export function formatTelegramHtml(text: string): string {
  return renderBlocks(toBlocks(text));
}

export function splitTelegramMessage(text: string, limit = 4096): string[] {
  return chunkBlocks(toBlocks(text), limit);
}

function toBlocks(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let plainStart = 0;
  let match: RegExpExecArray | null;

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
      } catch {
        blocks.push({ type: 'code', lang: 'dsh-ui', text: raw });
      }
    } else {
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

function pushPlain(blocks: TextBlock[], text: string): void {
  if (!text) return;
  const last = blocks[blocks.length - 1];
  if (last?.type === 'plain') {
    last.text = (last.text ?? '') + text;
  } else {
    blocks.push({ type: 'plain', text });
  }
}

function renderBlocks(blocks: TextBlock[]): string {
  return blocks.map(renderBlock).filter(Boolean).join('\n');
}

function renderBlock(block: TextBlock): string {
  switch (block.type) {
    case 'plain':
      return escapeHtml(block.text ?? '');
    case 'code':
      return renderCodeBlock(block);
    case 'html':
      return block.html ?? '';
    default:
      return '';
  }
}

function renderCodeBlock(block: TextBlock): string {
  const language = block.lang ? `<b>${escapeHtml(block.lang)}</b>\n` : '';
  return `<pre>${language}${escapeHtml(block.text ?? '')}</pre>`;
}

function chunkBlocks(blocks: TextBlock[], limit: number): string[] {
  const chunks: string[] = [];
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
        const renderedLine = escapeHtml(line);
        if (line.length > limit) {
          flush();
          for (let i = 0; i < line.length; i += limit) {
            chunks.push(escapeHtml(line.slice(i, i + limit)));
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
      } else {
        flush();
        const lines = (block.text ?? '').split('\n');
        let sub: string[] = [];
        let subTextLength = 0;
        const flushCodeChunk = () => {
          if (sub.length === 0) return;
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
    } else {
      flush();
      for (let i = 0; i < html.length; i += limit) {
        chunks.push(html.slice(i, i + limit));
      }
    }
  }

  flush();
  return chunks.length > 0 ? chunks : [''];
}


function renderDshUi(data: any): string {
  const parts: string[] = [];
  if (typeof data?.title === 'string' && data.title.trim()) {
    parts.push(`<b>${escapeHtml(data.title)}</b>`);
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  for (const item of items) {
    const rendered = renderDshUiItem(item);
    if (rendered) parts.push(rendered);
  }
  return parts.join('\n\n');
}

function renderDshUiItem(item: any): string {
  if (!item || typeof item !== 'object') return '';
  switch (item.type) {
    case 'keyvalue': {
      const pairs = Array.isArray(item.pairs) ? item.pairs : [];
      return pairs
        .filter((pair: any) => pair && typeof pair === 'object')
        .map((pair: any) => `<b>${escapeHtml(String(pair.key ?? ''))}</b>: ${escapeHtml(String(pair.value ?? ''))}`)
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
      return values.map((value: any) => `• ${escapeHtml(String(value))}`).join('\n');
    }
    case 'steps': {
      const steps = Array.isArray(item.items) ? item.items : [];
      return steps.map((step: any, index: number) => `${index + 1}. ${escapeHtml(String(step))}`).join('\n');
    }
    default:
      return '';
  }
}

function calloutIcon(tone: unknown): string {
  switch (tone) {
    case 'success': return '✅';
    case 'info': return 'ℹ️';
    case 'warning': return '⚠️';
    case 'error': return '❌';
    default: return '💬';
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
