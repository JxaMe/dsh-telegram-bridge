import type { DshApi } from './dsh-types.js';
import { createRpcId } from './rpc.js';
import type { SessionManager } from './session.js';
import type { StateStore } from './state.js';
import type { ChatSettings, QueueItem } from './types.js';

export class QueueManager {
  private queues = new Map<number, QueueItem[]>();
  private processing = new Map<number, boolean>();
  private failedItems = new Map<number, Map<string, QueueItem>>();

  constructor(
    private api: DshApi,
    private sessions: SessionManager,
    private state: StateStore,
    private onError?: (chatId: number, error: unknown, failureId: string) => void,
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

  getFailedItem(chatId: number, failureId: string): QueueItem | undefined {
    return this.failedItems.get(chatId)?.get(failureId);
  }

  listFailedItems(chatId: number): Array<{ id: string; item: QueueItem }> {
    const map = this.failedItems.get(chatId);
    if (!map) return [];
    return Array.from(map.entries()).map(([id, item]) => ({ id, item }));
  }

  clearFailedItem(chatId: number, failureId: string): void {
    const map = this.failedItems.get(chatId);
    if (!map) return;
    map.delete(failureId);
    if (map.size === 0) this.failedItems.delete(chatId);
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
          const failureId = createRpcId();
          const map = this.failedItems.get(chatId) ?? new Map<string, QueueItem>();
          map.set(failureId, item);
          this.failedItems.set(chatId, map);
          this.onError?.(chatId, error, failureId);
        }
      }
    } finally {
      this.processing.set(chatId, false);
    }
  }
}
