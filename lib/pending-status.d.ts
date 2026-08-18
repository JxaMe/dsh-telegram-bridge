import type { Bot } from 'grammy';
/**
 * Tracks the per-chat status message ("Deep diving..." / "thinking...") so it
 * can be updated in place, rate-limited, and removed when the reply arrives.
 */
export declare class PendingStatus {
    private chats;
    has(chatId: number): boolean;
    set(bot: Bot, chatId: number, messageId: number, queueLength?: number, text?: string): void;
    update(bot: Bot, chatId: number, text: string): void;
    setQueueLength(chatId: number, length: number): void;
    setActiveTool(chatId: number, name: string): void;
    clearActiveTool(chatId: number): void;
    showErrorThenClear(bot: Bot, chatId: number): Promise<void>;
    clear(bot: Bot, chatId: number): Promise<void>;
    dispose(): void;
    private editNow;
    private clearTimer;
    private clearEditTimer;
    private clearErrorTimer;
    private scheduleNext;
}
