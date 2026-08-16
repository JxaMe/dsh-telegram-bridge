import type { Bot } from 'grammy';
/**
 * Tracks the "Deep diving..." status message per chat so it can be removed
 * when the dsh agent reply arrives.
 */
export declare class PendingStatus {
    private messageIds;
    set(chatId: number, messageId: number): void;
    clear(bot: Bot, chatId: number): Promise<void>;
}
