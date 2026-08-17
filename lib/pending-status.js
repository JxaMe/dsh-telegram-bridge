const FIRST_HEARTBEAT_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 3_000;
const EDIT_COOLDOWN_MS = 2_000;
const ACTIVITY_PHRASES = [
    '🐋 正在思考...',
    '🐋 正在分析...',
    '🐋 正在查阅资料...',
    '🐋 正在写代码...',
    '🐋 正在设计架构...',
    '🐋 正在整理思路...',
    '🐋 正在组织回答...',
    '🐋 快好了...',
];
const ERROR_CLEAR_MS = 2_500;
/**
 * Tracks the per-chat status message ("Deep diving..." / "thinking...") so it
 * can be updated in place, rate-limited, and removed when the reply arrives.
 */
export class PendingStatus {
    messageIds = new Map();
    timers = new Map();
    startedAt = new Map();
    queueLengths = new Map();
    currentTexts = new Map();
    lastEditAt = new Map();
    pendingEditTexts = new Map();
    editTimers = new Map();
    errorTimers = new Map();
    activeTools = new Map();
    activityIndexes = new Map();
    has(chatId) {
        return this.messageIds.has(chatId);
    }
    set(bot, chatId, messageId, queueLength = 0, text = '🐋 Deep diving...') {
        this.clearEditTimer(chatId);
        this.clearTimer(chatId);
        this.clearErrorTimer(chatId);
        this.messageIds.set(chatId, messageId);
        this.startedAt.set(chatId, Date.now());
        this.queueLengths.set(chatId, queueLength);
        this.currentTexts.set(chatId, text);
        this.lastEditAt.set(chatId, Date.now());
        this.scheduleNext(bot, chatId, Date.now());
    }
    update(bot, chatId, text) {
        if (!this.messageIds.has(chatId))
            return;
        this.currentTexts.set(chatId, text);
        const now = Date.now();
        const last = this.lastEditAt.get(chatId) ?? 0;
        if (now - last >= EDIT_COOLDOWN_MS) {
            this.pendingEditTexts.delete(chatId);
            void this.editNow(bot, chatId, text);
            this.lastEditAt.set(chatId, Date.now());
            return;
        }
        this.pendingEditTexts.set(chatId, text);
        if (this.editTimers.has(chatId))
            return;
        const remaining = EDIT_COOLDOWN_MS - (now - last);
        const timer = setTimeout(() => {
            this.editTimers.delete(chatId);
            const text = this.pendingEditTexts.get(chatId);
            if (text === undefined)
                return;
            this.pendingEditTexts.delete(chatId);
            if (!this.messageIds.has(chatId))
                return;
            void this.editNow(bot, chatId, text);
            this.lastEditAt.set(chatId, Date.now());
        }, Math.max(1, remaining));
        this.editTimers.set(chatId, timer);
    }
    setActiveTool(chatId, name) {
        this.activeTools.set(chatId, name);
    }
    clearActiveTool(chatId) {
        this.activeTools.delete(chatId);
    }
    async showErrorThenClear(bot, chatId) {
        await this.update(bot, chatId, '❌ 处理失败');
        this.clearErrorTimer(chatId);
        const timer = setTimeout(() => {
            this.errorTimers.delete(chatId);
            void this.clear(bot, chatId);
        }, ERROR_CLEAR_MS);
        this.errorTimers.set(chatId, timer);
    }
    async clear(bot, chatId) {
        this.clearTimer(chatId);
        this.clearEditTimer(chatId);
        this.clearErrorTimer(chatId);
        const messageId = this.messageIds.get(chatId);
        this.messageIds.delete(chatId);
        this.startedAt.delete(chatId);
        this.queueLengths.delete(chatId);
        this.currentTexts.delete(chatId);
        this.pendingEditTexts.delete(chatId);
        this.lastEditAt.delete(chatId);
        this.activeTools.delete(chatId);
        this.activityIndexes.delete(chatId);
        if (messageId === undefined)
            return;
        try {
            await bot.api.deleteMessage(chatId, messageId);
        }
        catch {
            // The message may already be gone; ignore.
        }
    }
    dispose() {
        for (const chatId of this.timers.keys()) {
            this.clearTimer(chatId);
        }
        for (const chatId of this.editTimers.keys()) {
            this.clearEditTimer(chatId);
        }
        for (const chatId of this.errorTimers.keys()) {
            this.clearErrorTimer(chatId);
        }
        this.messageIds.clear();
        this.startedAt.clear();
        this.queueLengths.clear();
        this.currentTexts.clear();
        this.lastEditAt.clear();
        this.pendingEditTexts.clear();
        this.activeTools.clear();
        this.activityIndexes.clear();
    }
    async editNow(bot, chatId, text) {
        const messageId = this.messageIds.get(chatId);
        if (messageId === undefined)
            return;
        try {
            await bot.api.editMessageText(chatId, messageId, text);
        }
        catch {
            // Ignore edit failures; the message may have been deleted already.
        }
    }
    clearTimer(chatId) {
        const timer = this.timers.get(chatId);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.timers.delete(chatId);
        }
    }
    clearEditTimer(chatId) {
        const timer = this.editTimers.get(chatId);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.editTimers.delete(chatId);
        }
    }
    clearErrorTimer(chatId) {
        const timer = this.errorTimers.get(chatId);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.errorTimers.delete(chatId);
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
            const queueLen = this.queueLengths.get(chatId) ?? 0;
            let text;
            const activeTool = this.activeTools.get(chatId);
            if (activeTool !== undefined) {
                text = `正在调用工具：${activeTool}`;
            }
            else {
                const index = this.activityIndexes.get(chatId) ?? 0;
                text = ACTIVITY_PHRASES[index % ACTIVITY_PHRASES.length];
                this.activityIndexes.set(chatId, index + 1);
            }
            this.currentTexts.set(chatId, text);
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
