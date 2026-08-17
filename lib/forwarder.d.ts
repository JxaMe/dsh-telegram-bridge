import type { Bot } from 'grammy';
import type { DshContext } from './dsh-types.js';
import type { PendingStatus } from './pending-status.js';
import type { QueueManager } from './queue.js';
import type { StateStore } from './state.js';
import type { Logger } from './logger.js';
export declare class EventForwarder {
    private ctx;
    private bot;
    private state;
    private pending;
    private queue;
    private onPendingClear?;
    private htmlFormatting;
    private statusLineEnabled;
    private logger?;
    private lastToolAt;
    constructor(ctx: DshContext, bot: Bot, state: StateStore, pending: PendingStatus, queue: QueueManager, onPendingClear?: ((chatId: number) => void) | undefined, htmlFormatting?: boolean, statusLineEnabled?: boolean, logger?: Logger | undefined);
    start(): void;
    private updateStatusFromEvent;
    private findChatId;
    private sendToTelegram;
}
export declare function formatTelegramHtml(text: string): string;
export declare function splitTelegramMessage(text: string, limit?: number): string[];
export declare function splitPlainMessage(text: string, limit?: number): string[];
export declare function escapeHtml(value: string): string;
