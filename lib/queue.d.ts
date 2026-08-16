import type { DshApi } from './dsh-types.js';
import type { SessionManager } from './session.js';
import type { StateStore } from './state.js';
export declare class QueueManager {
    private api;
    private sessions;
    private state;
    private onError?;
    private maxQueueSize;
    private queues;
    private processing;
    constructor(api: DshApi, sessions: SessionManager, state: StateStore, onError?: ((chatId: number, error: unknown) => void) | undefined, maxQueueSize?: number);
    enqueue(chatId: number, text: string): boolean;
    clear(chatId: number): void;
    queueLength(chatId: number): number;
    isProcessing(chatId: number): boolean;
    private drain;
}
