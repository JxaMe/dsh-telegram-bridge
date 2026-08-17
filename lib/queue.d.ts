import type { DshApi } from './dsh-types.js';
import type { SessionManager } from './session.js';
import type { StateStore } from './state.js';
import type { QueueItem } from './types.js';
export declare class QueueManager {
    private api;
    private sessions;
    private state;
    private onError?;
    private maxQueueSize;
    private queues;
    private processing;
    private failedItems;
    constructor(api: DshApi, sessions: SessionManager, state: StateStore, onError?: ((chatId: number, error: unknown, failureId: string) => void) | undefined, maxQueueSize?: number);
    enqueue(chatId: number, text: string): boolean;
    clear(chatId: number): void;
    queueLength(chatId: number): number;
    isProcessing(chatId: number): boolean;
    getFailedItem(chatId: number, failureId: string): QueueItem | undefined;
    listFailedItems(chatId: number): Array<{
        id: string;
        item: QueueItem;
    }>;
    clearFailedItem(chatId: number, failureId: string): void;
    private drain;
}
