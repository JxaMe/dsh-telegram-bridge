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
    private maxQueueSize = 20,
  ) {}

  enqueue(chatId: number, text: string): boolean {
    const queue = this.queues.get(chatId) ?? [];
    if (this.maxQueueSize > 0 && queue.length >= this.maxQueueSize) {
      return false;
    }
    queue.push({ chatId, text });
    this.queues.set(chatId, queue);
    void this.drain(chatId);
    return true;
  }

  clear(chatId: number): void {
    this.queues.set(chatId, []);
  }

  queueLength(chatId: number): number {
    return (this.queues.get(chatId) ?? []).length;
  }

  isProcessing(chatId: number): boolean {
    return this.processing.get(chatId) ?? false;
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
          let sessionId = await this.sessions.ensureSession(chatId, settings);
          let res = await this.api.sessions.prompt({
            rpcId: createRpcId(),
            payload: {
              sessionId,
              mode: 'queue',
              content: [{ type: 'text', text: item.text }],
            },
          });
          if (!res.result.ok && res.result.error.code === 'session-not-found') {
            sessionId = await this.sessions.resetSession(chatId, settings);
            res = await this.api.sessions.prompt({
              rpcId: createRpcId(),
              payload: {
                sessionId,
                mode: 'queue',
                content: [{ type: 'text', text: item.text }],
              },
            });
          }
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
