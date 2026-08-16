import type { DshApi } from './dsh-types.js';
import { createRpcId } from './rpc.js';
import type { SessionManager } from './session.js';
import type { StateStore } from './state.js';
import type { ChatSettings, QueueItem } from './types.js';

export class QueueManager {
  private queues = new Map<number, QueueItem[]>();
  private processing = new Map<number, boolean>();

  constructor(
    private api: DshApi,
    private sessions: SessionManager,
    private state: StateStore,
    private onError?: (chatId: number, error: unknown) => void,
  ) {}

  enqueue(chatId: number, text: string): void {
    const queue = this.queues.get(chatId) ?? [];
    queue.push({ chatId, text });
    this.queues.set(chatId, queue);
    void this.drain(chatId);
  }

  clear(chatId: number): void {
    this.queues.set(chatId, []);
  }

  queueLength(chatId: number): number {
    return (this.queues.get(chatId) ?? []).length;
  }

  private async drain(chatId: number): Promise<void> {
    if (this.processing.get(chatId)) return;
    this.processing.set(chatId, true);
    try {
      while (true) {
        const queue = this.queues.get(chatId) ?? [];
        const item = queue.shift();
        if (!item) break;
        this.queues.set(chatId, queue);
        try {
          const settings: ChatSettings = this.state.getChatSettings(chatId);
          const sessionId = await this.sessions.ensureSession(chatId, settings);
          const res = await this.api.sessions.prompt({
            rpcId: createRpcId(),
            payload: {
              sessionId,
              mode: 'queue',
              content: [{ type: 'text', text: item.text }],
            },
          });
          if (!res.result.ok) {
            throw new Error(`prompt failed: ${JSON.stringify(res.result.error)}`);
          }
        } catch (error) {
          this.onError?.(chatId, error);
        }
      }
    } finally {
      this.processing.set(chatId, false);
    }
  }
}
