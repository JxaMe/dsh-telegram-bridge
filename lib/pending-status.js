/**
 * Tracks the "Deep diving..." status message per chat so it can be removed
 * when the dsh agent reply arrives.
 */
export class PendingStatus {
    messageIds = new Map();
    set(chatId, messageId) {
        this.messageIds.set(chatId, messageId);
    }
    async clear(bot, chatId) {
        const messageId = this.messageIds.get(chatId);
        if (messageId === undefined)
            return;
        this.messageIds.delete(chatId);
        try {
            await bot.api.deleteMessage(chatId, messageId);
        }
        catch {
            // The message may already be gone; ignore.
        }
    }
}
