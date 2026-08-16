import type { DshApi } from './dsh-types.js';
import type { SessionManager } from './session.js';
import type { StateStore } from './state.js';
export declare class QueueManager {
    private api;
    private sessions;
    private state;
    private onError?;
    private queues;
    private processing;
    constructor(api: DshApi, sessions: SessionManager, state: StateStore, onError?: ((chatId: number, error: unknown) => void) | undefined);
    enqueue(chatId: number, text: string): void;
    clear(chatId: number): void;
    queueLength(chatId: number): number;
    private drain;
}
