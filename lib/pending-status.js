const FIRST_HEARTBEAT_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 3_000;
const EDIT_COOLDOWN_MS = 2_000;
const ACTIVITY_PHRASES = [
    '🐋 正在思考...',
    '🐋 正在处理...',
    '🐋 还在继续...',
    '🐋 正在整理...',
];
const ERROR_CLEAR_MS = 2_500;
/**
 * Tracks the per-chat status message ("Deep diving..." / "thinking...") so it
 * can be updated in place, rate-limited, and removed when the reply arrives.
 */
export class PendingStatus {
    chats = new Map();
    has(chatId) {
        const chat = this.chats.get(chatId);
        return chat?.messageId !== undefined;
    }
    set(bot, chatId, messageId, queueLength = 0, text = '🐋 Deep diving...') {
        this.clearEditTimer(chatId);
        this.clearTimer(chatId);
        this.clearErrorTimer(chatId);
        this.chats.set(chatId, {
            messageId,
            startedAt: Date.now(),
            queueLength,
            currentText: text,
            lastEditAt: Date.now(),
            activityIndex: 0,
        });
        this.scheduleNext(bot, chatId, Date.now());
    }
    update(bot, chatId, text) {
        const chat = this.chats.get(chatId);
        if (!chat?.messageId)
            return;
        chat.currentText = text;
        const now = Date.now();
        const last = chat.lastEditAt ?? 0;
        if (now - last >= EDIT_COOLDOWN_MS) {
            chat.pendingEditText = undefined;
            void this.editNow(bot, chatId, text);
            chat.lastEditAt = Date.now();
            return;
        }
        chat.pendingEditText = text;
        if (chat.editTimer)
            return;
        const remaining = EDIT_COOLDOWN_MS - (now - last);
        const timer = setTimeout(() => {
            chat.editTimer = undefined;
            const text = chat.pendingEditText;
            if (text === undefined)
                return;
            chat.pendingEditText = undefined;
            if (!chat.messageId)
                return;
            void this.editNow(bot, chatId, text);
            chat.lastEditAt = Date.now();
        }, Math.max(1, remaining));
        chat.editTimer = timer;
    }
    setQueueLength(chatId, length) {
        const chat = this.chats.get(chatId);
        if (chat)
            chat.queueLength = length;
    }
    setActiveTool(chatId, name) {
        const chat = this.chats.get(chatId);
        if (chat)
            chat.activeTool = name;
    }
    clearActiveTool(chatId) {
        const chat = this.chats.get(chatId);
        if (chat)
            chat.activeTool = undefined;
    }
    async showErrorThenClear(bot, chatId) {
        await this.update(bot, chatId, '❌ 处理失败');
        this.clearErrorTimer(chatId);
        const chat = this.chats.get(chatId);
        if (!chat)
            return;
        const timer = setTimeout(() => {
            chat.errorTimer = undefined;
            void this.clear(bot, chatId);
        }, ERROR_CLEAR_MS);
        chat.errorTimer = timer;
    }
    async clear(bot, chatId) {
        this.clearTimer(chatId);
        this.clearEditTimer(chatId);
        this.clearErrorTimer(chatId);
        const chat = this.chats.get(chatId);
        this.chats.delete(chatId);
        if (!chat?.messageId)
            return;
        try {
            await bot.api.deleteMessage(chatId, chat.messageId);
        }
        catch {
            // The message may already be gone; ignore.
        }
    }
    dispose() {
        for (const chatId of this.chats.keys()) {
            this.clearTimer(chatId);
            this.clearEditTimer(chatId);
            this.clearErrorTimer(chatId);
        }
        this.chats.clear();
    }
    async editNow(bot, chatId, text) {
        const chat = this.chats.get(chatId);
        if (!chat?.messageId)
            return;
        try {
            await bot.api.editMessageText(chatId, chat.messageId, text);
        }
        catch {
            // Ignore edit failures; the message may have been deleted already.
        }
    }
    clearTimer(chatId) {
        const chat = this.chats.get(chatId);
        if (chat?.timer) {
            clearTimeout(chat.timer);
            chat.timer = undefined;
        }
    }
    clearEditTimer(chatId) {
        const chat = this.chats.get(chatId);
        if (chat?.editTimer) {
            clearTimeout(chat.editTimer);
            chat.editTimer = undefined;
        }
    }
    clearErrorTimer(chatId) {
        const chat = this.chats.get(chatId);
        if (chat?.errorTimer) {
            clearTimeout(chat.errorTimer);
            chat.errorTimer = undefined;
        }
    }
    scheduleNext(bot, chatId, startedAt) {
        const chat = this.chats.get(chatId);
        if (!chat?.messageId)
            return;
        const elapsed = Date.now() - startedAt;
        const delay = elapsed === 0 ? FIRST_HEARTBEAT_MS : HEARTBEAT_INTERVAL_MS;
        const timer = setTimeout(async () => {
            chat.timer = undefined;
            const currentChat = this.chats.get(chatId);
            if (!currentChat?.messageId || currentChat.messageId !== chat.messageId)
                return;
            const queueLen = currentChat.queueLength;
            let text;
            const activeTool = currentChat.activeTool;
            if (activeTool !== undefined) {
                text = `正在调用工具：${activeTool}`;
            }
            else {
                const index = currentChat.activityIndex;
                text = ACTIVITY_PHRASES[index % ACTIVITY_PHRASES.length];
                currentChat.activityIndex = index + 1;
            }
            currentChat.currentText = text;
            if (queueLen > 0) {
                text += ` · 队列还有 ${queueLen} 条`;
            }
            this.update(bot, chatId, text);
            this.scheduleNext(bot, chatId, startedAt);
        }, delay);
        chat.timer = timer;
    }
}
