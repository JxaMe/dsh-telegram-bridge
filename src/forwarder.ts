import type { Bot } from 'grammy';
import type { DshContext } from './dsh-types.js';
import type { PendingStatus } from './pending-status.js';
import type { QueueManager } from './queue.js';
import type { StateStore } from './state.js';
import { replyActionsKeyboard } from './menu.js';
import { incrError, incrReplySent } from './metrics.js';
import type { Logger } from './logger.js';

export class EventForwarder {
  private lastToolAt = new Map<number, number>();

  constructor(
    private ctx: DshContext,
    private bot: Bot,
    private state: StateStore,
    private pending: PendingStatus,
    private queue: QueueManager,
    private onPendingClear?: (chatId: number) => void,
    private htmlFormatting = true,
    private statusLineEnabled = true,
    private logger?: Logger,
  ) {}

  start(): void {
    this.ctx.on('session/event', async (session: unknown, event: unknown) => {
      const evt = event as DshSessionEventEnvelope;
      const sessionRecord = session as { id?: unknown } | null;
      const sessionId = typeof sessionRecord?.id === 'string' ? sessionRecord.id : undefined;
      if (!sessionId) return;
      const chatId = this.findChatId(sessionId);
      if (chatId === undefined) return;

      if (evt?.type !== 'assistant/message') {
        this.updateStatusFromEvent(chatId, evt);
        if (evt?.type === 'turn/end') {
          if (this.queue.queueLength(chatId) > 0) {
            this.pending.update(this.bot, chatId, '🐋 正在思考...');
          } else {
            await this.pending.clear(this.bot, chatId);
            this.onPendingClear?.(chatId);
          }
        }
        return;
      }

      const data = evt.data ?? {};
      const text = extractText(data.message?.content ?? data.content);
      const chatState = this.state.getChatState(chatId);
      if (chatState) {
        this.state.updateAssistantMessageAndChatState(chatId, data.usage, { ...chatState, lastActiveAt: Date.now() });
      } else {
        this.state.addAssistantMessage(chatId, data.usage);
      }
      if (!text) {
        // Empty assistant/message usually only carries usage stats.
        // Keep the status line alive until turn/end so long tasks don't look stuck.
        return;
      }
      void this.sendToTelegram(chatId, text).catch(async (error) => {
        await this.pending.clear(this.bot, chatId);
        this.onPendingClear?.(chatId);
        incrError();
        const message = `reply send failed: ${error instanceof Error ? error.message : String(error)}`;
        if (this.logger) {
          this.logger.error(message);
        } else {
          this.ctx.logger.warn(message);
        }
      });
    });
  }

  private updateStatusFromEvent(chatId: number, evt: DshSessionEventEnvelope): void {
    if (!this.statusLineEnabled) return;
    const data = evt.data ?? {};
    switch (evt.type) {
      case 'turn/start':
        this.pending.update(this.bot, chatId, '🐋 正在思考...');
        break;
      case 'step/start': {
        const step = typeof data.step === 'number' ? data.step : 0;
        this.pending.update(this.bot, chatId, step > 1 ? `第 ${step} 步：正在思考...` : '🐋 正在思考...');
        break;
      }
      case 'tool/call': {
        const now = Date.now();
        const last = this.lastToolAt.get(chatId) ?? 0;
        const name = typeof data.name === 'string' ? data.name : '未知工具';
        this.pending.update(this.bot, chatId, now - last < 3000 ? '正在连续调用工具...' : `正在调用工具：${name}`);
        this.pending.setActiveTool(chatId, name);
        this.lastToolAt.set(chatId, now);
        break;
      }
      case 'tool/result': {
        const now = Date.now();
        const last = this.lastToolAt.get(chatId) ?? 0;
        this.pending.clearActiveTool(chatId);
        this.pending.update(this.bot, chatId, now - last < 3000 ? '正在连续调用工具...' : '🐋 正在思考...');
        break;
      }
      case 'command/run': {
        const name = typeof data.name === 'string' ? data.name : '未知命令';
        this.pending.update(this.bot, chatId, `正在执行命令：${name}`);
        break;
      }
      default:
        break;
    }
  }

  private findChatId(sessionId: string): number | undefined {
    const state = this.state.loadState();
    for (const [chatId, chat] of Object.entries(state.chats)) {
      if (chat.sessionId === sessionId) return Number(chatId);
      if (chat.sessions?.some((entry) => entry.sessionId === sessionId)) return Number(chatId);
    }
    return undefined;
  }

  private async sendToTelegram(chatId: number, text: string): Promise<void> {
    // Do NOT clear the status line here: an assistant/message may be an
    // intermediate acknowledgement while the agent keeps working. Only
    // turn/end (or a real terminal state) clears it.
    const chunks = splitTelegramMessage(text);
    const showActions = this.queue.queueLength(chatId) === 0 && shouldShowQuickActions(text);
    const isLastChunk = (index: number) => index === chunks.length - 1 && showActions;
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const replyMarkup = isLastChunk(index) ? { reply_markup: replyActionsKeyboard() } : undefined;
      try {
        await this.sendWithRetry(() => this.bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML', ...replyMarkup }));
      } catch {
        await this.sendWithRetry(() => this.bot.api.sendMessage(chatId, chunk, replyMarkup));
      }
    }
    incrReplySent();
    if (this.queue.queueLength(chatId) > 0) {
      const sent = await this.bot.api.sendMessage(chatId, '🐋 正在思考...');
      this.pending.set(this.bot, chatId, sent.message_id, this.queue.queueLength(chatId));
    }
    // If no more queued items, keep the existing status until turn/end.
  }

  private async sendWithRetry(fn: () => Promise<unknown>): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await fn();
        return;
      } catch (error) {
        lastError = error;
        const code = (error as { error_code?: number }).error_code;
        if (code === 429) {
          const retryAfter = (error as { retry_after?: number }).retry_after ?? 1;
          await sleep(Math.min(10, retryAfter) * 1000);
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }
}

function shouldShowQuickActions(text: string): boolean {
  if (text.length >= 500) return true;
  if (text.includes('```')) return true;
  if (text.includes('dsh-ui')) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DshSessionEventEnvelope {
  type?: string;
  data?: DshEventData;
}

interface DshEventData {
  message?: { content?: unknown };
  content?: unknown;
  usage?: DshTokenUsage;
  step?: unknown;
  name?: unknown;
}

interface DshTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

interface DshTextBlock {
  type?: string;
  text?: unknown;
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter(isTextBlock)
    .map((block) => String(block.text ?? ''))
    .join('\n')
    .trim();
}

function isTextBlock(block: unknown): block is DshTextBlock {
  if (typeof block !== 'object' || block === null) return false;
  return (block as Record<string, unknown>).type === 'text';
}

interface TextBlock {
  type: 'plain' | 'code' | 'html';
  text?: string;
  lang?: string;
  html?: string;
}

const FENCED_BLOCK_RE = /```([^\n`]*)[ \t]*\n([\s\S]*?)```/g;



export function splitTelegramMessage(text: string, limit = 4096): string[] {
  return chunkBlocks(toBlocks(text), limit);
}



function splitLongPlainLine(line: string, limit: number): string[] {
  const parts = line.split(/(?<=[。！？!?.])\s+/);
  const out: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current.length > 0 && current.length + part.length + 1 > limit) {
      out.push(current);
      current = '';
    }
    if (part.length > limit) {
      if (current.length > 0) {
        out.push(current);
        current = '';
      }
      for (let i = 0; i < part.length; i += limit) {
        out.push(part.slice(i, i + limit));
      }
      continue;
    }
    current += (current.length > 0 ? ' ' : '') + part;
  }
  if (current.length > 0) out.push(current);
  return out.length > 0 ? out : [line];
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

function formatPlainText(text: string): string {
  const lines = text.split('\n');
  return lines.map(formatPlainLine).join('\n');
}

function formatPlainLine(line: string): string {
  const hrMatch = /^\s*(?:---+|\*\*\*+)\s*$/.exec(line);
  if (hrMatch) return '<b>──────────</b>';

  let prefix = '';
  let rest = line;

  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) {
    rest = heading[2] ?? '';
  }

  const quote = /^>\s?(.*)$/.exec(rest);
  if (quote) {
    prefix += '💬 ';
    rest = quote[1] ?? '';
  }

  const bullet = /^[-*]\s+(.*)$/.exec(rest);
  if (bullet) {
    prefix += '• ';
    rest = bullet[1] ?? '';
  }

  const ordered = /^(\d+)[.)]\s+(.*)$/.exec(rest);
  if (ordered) {
    prefix += `${ordered[1]}. `;
    rest = ordered[2] ?? '';
  }

  return prefix + formatInlineText(rest);
}

function formatInlineText(text: string): string {
  let output = '';
  let last = 0;
  const re = /`([^`]+)`|(https?:\/\/[^\s<>()"]+)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      output += escapeHtml(text.slice(last, m.index));
    }
    if (m[1] !== undefined) {
      output += `<code>${escapeHtml(m[1])}</code>`;
    } else if (m[2] !== undefined) {
      const url = m[2];
      output += `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`;
    } else if (m[3] !== undefined) {
      output += `<b>${escapeHtml(m[3].slice(2, -2))}</b>`;
    } else if (m[4] !== undefined) {
      output += `<i>${escapeHtml(m[4].slice(1, -1))}</i>`;
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    output += escapeHtml(text.slice(last));
  }
  return output;
}

function renderBlock(block: TextBlock): string {
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

const CODE_BLOCK_MAX_LINES = 50;

function renderCodeBlock(block: TextBlock): string {
  const language = block.lang ? `<code>${escapeHtml(block.lang)}</code>\n` : '';
  const raw = block.text ?? '';
  const lines = raw.split('\n');
  let text = raw;
  if (lines.length > CODE_BLOCK_MAX_LINES) {
    text = `${lines.slice(0, CODE_BLOCK_MAX_LINES).join('\n')}\n… 已截断，共 ${lines.length} 行`;
  }
  return `<pre>${language}${escapeHtml(text)}</pre>`;
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
        const renderedLine = formatPlainText(line);
        if (line.length > limit || renderedLine.length > limit) {
          flush();
          if (line.length > limit) {
            for (const part of splitLongPlainLine(line, limit)) {
              chunks.push(formatPlainText(part));
            }
          } else {
            const ratio = line.length / renderedLine.length;
            const rawStep = Math.max(1, Math.floor(limit * ratio));
            for (let i = 0; i < line.length; i += rawStep) {
              chunks.push(formatPlainText(line.slice(i, i + rawStep)));
            }
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


function renderDshUi(data: unknown): string {
  const record = asRecord(data);
  if (!record) return '';
  const parts: string[] = [];
  const title = record.title;
  if (typeof title === 'string' && title.trim()) {
    parts.push(`<b>${escapeHtml(title)}</b>`);
  }
  const items = Array.isArray(record.items) ? record.items : [];
  for (const item of items) {
    const rendered = renderDshUiItem(item);
    if (rendered) parts.push(rendered);
  }
  return parts.join('\n\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function renderDshUiItem(item: unknown): string {
  const record = asRecord(item);
  if (!record) return '';
  switch (record.type) {
    case 'keyvalue': {
      const pairs = Array.isArray(record.pairs) ? record.pairs : [];
      return pairs
        .filter((pair): pair is Record<string, unknown> => asRecord(pair) !== null)
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
      return values
        .map((value) => {
          const entry = asRecord(value);
          if (entry !== null && typeof entry.title === 'string') {
            const desc = typeof entry.desc === 'string' && entry.desc.trim() ? ` — ${entry.desc}` : '';
            return `• <b>${escapeHtml(entry.title)}</b>${escapeHtml(desc)}`;
          }
          return `• ${escapeHtml(String(value))}`;
        })
        .join('\n');
    }
    case 'steps': {
      const steps = Array.isArray(record.items) ? record.items : [];
      return steps
        .map((step, index) => {
          const entry = asRecord(step);
          if (entry !== null && typeof entry.title === 'string') {
            const desc = typeof entry.desc === 'string' && entry.desc.trim() ? ` — ${entry.desc}` : '';
            return `${index + 1}. <b>${escapeHtml(entry.title)}</b>${escapeHtml(desc)}`;
          }
          return `${index + 1}. ${escapeHtml(String(step))}`;
        })
        .join('\n');
    }
    case 'table': {
      const headers = Array.isArray(record.headers) ? record.headers.map(String) : [];
      const rows = Array.isArray(record.rows) ? record.rows : [];
      const allRows = rows
        .map((row) => Array.isArray(row) ? row.map(String) : [])
        .filter((row) => row.length > 0);
      if (headers.length === 0 && allRows.length === 0) return '';
      const renderRow = (cells: string[]) => `| ${cells.map((cell) => escapeHtml(cell)).join(' | ')} |`;
      const lines: string[] = [];
      if (headers.length > 0) lines.push(renderRow(headers));
      for (const row of allRows) lines.push(renderRow(row));
      return `<pre>${lines.join('\n')}</pre>`;
    }
    case 'todo': {
      const items = Array.isArray(record.items) ? record.items : [];
      return items
        .map((item) => {
          const entry = asRecord(item);
          const done = entry !== null && (entry.done === true || entry.checked === true);
          const title = entry !== null
            ? typeof entry.title === 'string' ? entry.title : typeof entry.text === 'string' ? entry.text : String(item)
            : String(item);
          return `${done ? '✅' : '⬜'} ${escapeHtml(title)}`;
        })
        .join('\n');
    }
    case 'section': {
      const title = typeof record.title === 'string' ? record.title : '';
      if (!title.trim()) return '';
      return `<b>${escapeHtml(title)}</b>\n──────────`;
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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
