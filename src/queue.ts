import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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
    private dataDir?: string,
  ) {
    this.loadQueues();
    for (const chatId of this.queues.keys()) {
      void this.drain(chatId);
    }
  }

  enqueue(chatId: number, text: string): boolean {
    const queue = this.queues.get(chatId) ?? [];
    if (this.maxQueueSize > 0 && queue.length >= this.maxQueueSize) {
      return false;
    }
    queue.push({ chatId, text });
    this.queues.set(chatId, queue);
    this.persistQueues();
    void this.drain(chatId);
    return true;
  }

  clear(chatId: number): void {
    this.queues.set(chatId, []);
    this.persistQueues();
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

  private loadQueues(): void {
    if (!this.dataDir) return;
    try {
      const file = path.join(this.dataDir, 'queue.json');
      if (!existsSync(file)) return;
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, QueueItem[]>;
      for (const [chatId, items] of Object.entries(parsed)) {
        if (Array.isArray(items)) {
          this.queues.set(Number(chatId), items.filter((item) => item && typeof item.text === 'string'));
        }
      }
    } catch {
      // A corrupted queue file is ignored; the queue just starts empty.
    }
  }

  private persistQueues(): void {
    if (!this.dataDir) return;
    try {
      mkdirSync(this.dataDir, { recursive: true });
      const file = path.join(this.dataDir, 'queue.json');
      const tmp = `${file}.tmp`;
      const data: Record<string, QueueItem[]> = {};
      for (const [chatId, items] of this.queues) {
        if (items.length > 0) data[String(chatId)] = items;
      }
      writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
      renameSync(tmp, file);
    } catch {
      // Persistence is best-effort; never break the queue on write failure.
    }
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
        this.persistQueues();
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
