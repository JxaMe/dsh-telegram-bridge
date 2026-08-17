import type { Bot } from 'grammy';
import type { DshContext } from './dsh-types.js';
import type { PendingStatus } from './pending-status.js';
import type { QueueManager } from './queue.js';
import type { StateStore } from './state.js';
export declare class EventForwarder {
    private ctx;
    private bot;
    private state;
    private pending;
    private queue;
    constructor(ctx: DshContext, bot: Bot, state: StateStore, pending: PendingStatus, queue: QueueManager);
    start(): void;
    private findChatId;
    private sendToTelegram;
}
export declare function formatTelegramHtml(text: string): string;
export declare function splitTelegramMessage(text: string, limit?: number): string[];
export declare function escapeHtml(value: string): string;
