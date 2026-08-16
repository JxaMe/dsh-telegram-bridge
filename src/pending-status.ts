import type { Bot } from 'grammy';

/**
 * Tracks the "Deep diving..." status message per chat so it can be removed
 * when the dsh agent reply arrives.
 */
export class PendingStatus {
  private messageIds = new Map<number, number>();

  set(chatId: number, messageId: number): void {
    this.messageIds.set(chatId, messageId);
  }

  async clear(bot: Bot, chatId: number): Promise<void> {
    const messageId = this.messageIds.get(chatId);
    if (messageId === undefined) return;
    this.messageIds.delete(chatId);
    try {
      await bot.api.deleteMessage(chatId, messageId);
    } catch {
      // The message may already be gone; ignore.
    }
  }
}
