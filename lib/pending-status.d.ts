import type { Bot } from 'grammy';
/**
 * Tracks the "Deep diving..." status message per chat so it can be updated
 * while waiting and removed when the dsh agent reply arrives.
 */
export declare class PendingStatus {
    private messageIds;
    private timers;
    private startedAt;
    private queueLengths;
    has(chatId: number): boolean;
    set(bot: Bot, chatId: number, messageId: number, queueLength?: number): void;
    clear(bot: Bot, chatId: number): Promise<void>;
    private clearTimer;
    private scheduleNext;
}
