import type { Bot } from 'grammy';
import type { DshContext } from './dsh-types.js';
import type { StateStore } from './state.js';

export class EventForwarder {
  constructor(
    private ctx: DshContext,
    private bot: Bot,
    private state: StateStore,
  ) {}

  start(): void {
    this.ctx.on('session/event', (session: any, event: any) => {
      if (event?.type !== 'assistant/message') return;
      const sessionId: string | undefined = session?.id;
      if (!sessionId) return;
      const chatId = this.findChatId(sessionId);
      if (chatId === undefined) return;
      const text = extractText(event.data?.content);
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
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
      } catch {
        await this.bot.api.sendMessage(chatId, chunk);
      }
    }
  }
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((block: any) => (block?.type === 'text' ? String(block.text ?? '') : ''))
    .join('\n')
    .trim();
}

function splitMessage(text: string, limit = 4096): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks.length > 0 ? chunks : [''];
}
