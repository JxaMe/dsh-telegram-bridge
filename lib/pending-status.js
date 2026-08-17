const FIRST_HEARTBEAT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
/**
 * Tracks the "Deep diving..." status message per chat so it can be updated
 * while waiting and removed when the dsh agent reply arrives.
 */
export class PendingStatus {
    messageIds = new Map();
    timers = new Map();
    startedAt = new Map();
    queueLengths = new Map();
    has(chatId) {
        return this.messageIds.has(chatId);
    }
    set(bot, chatId, messageId, queueLength = 0) {
        this.clearTimer(chatId);
        this.messageIds.set(chatId, messageId);
        this.startedAt.set(chatId, Date.now());
        this.queueLengths.set(chatId, queueLength);
        this.scheduleNext(bot, chatId, Date.now());
    }
    async clear(bot, chatId) {
        this.clearTimer(chatId);
        const messageId = this.messageIds.get(chatId);
        this.messageIds.delete(chatId);
        this.startedAt.delete(chatId);
        this.queueLengths.delete(chatId);
        if (messageId === undefined)
            return;
        try {
            await bot.api.deleteMessage(chatId, messageId);
        }
        catch {
            // The message may already be gone; ignore.
        }
    }
    clearTimer(chatId) {
        const timer = this.timers.get(chatId);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.timers.delete(chatId);
        }
    }
    scheduleNext(bot, chatId, startedAt) {
        const messageId = this.messageIds.get(chatId);
        if (messageId === undefined)
            return;
        const elapsed = Date.now() - startedAt;
        const delay = elapsed === 0 ? FIRST_HEARTBEAT_MS : HEARTBEAT_INTERVAL_MS;
        const timer = setTimeout(async () => {
            this.timers.delete(chatId);
            const currentId = this.messageIds.get(chatId);
            if (currentId === undefined || currentId !== messageId)
                return;
            const seconds = Math.round((Date.now() - (this.startedAt.get(chatId) ?? startedAt)) / 1000);
            const queueLen = this.queueLengths.get(chatId) ?? 0;
            let text = `仍在处理中... (${seconds}s)`;
            if (queueLen > 0) {
                text += ` · 队列还有 ${queueLen} 条`;
            }
            try {
                await bot.api.editMessageText(chatId, messageId, text);
            }
            catch {
                // Ignore edit failures; the message may have been deleted already.
            }
            this.scheduleNext(bot, chatId, startedAt);
        }, delay);
        this.timers.set(chatId, timer);
    }
}
