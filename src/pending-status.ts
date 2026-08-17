import type { Bot } from 'grammy';

const FIRST_HEARTBEAT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 15_000;
const EDIT_COOLDOWN_MS = 2_000;
const LONG_WAIT_MS = 30_000;
const ERROR_CLEAR_MS = 2_500;

/**
 * Tracks the per-chat status message ("Deep diving..." / "thinking...") so it
 * can be updated in place, rate-limited, and removed when the reply arrives.
 */
export class PendingStatus {
  private messageIds = new Map<number, number>();
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private startedAt = new Map<number, number>();
  private queueLengths = new Map<number, number>();
  private currentTexts = new Map<number, string>();
  private lastEditAt = new Map<number, number>();
  private pendingEditTexts = new Map<number, string>();
  private editTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private errorTimers = new Map<number, ReturnType<typeof setTimeout>>();

  has(chatId: number): boolean {
    return this.messageIds.has(chatId);
  }

  set(bot: Bot, chatId: number, messageId: number, queueLength = 0, text = '🐋 Deep diving...'): void {
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

  update(bot: Bot, chatId: number, text: string): void {
    if (!this.messageIds.has(chatId)) return;
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
    if (this.editTimers.has(chatId)) return;
    const remaining = EDIT_COOLDOWN_MS - (now - last);
    const timer = setTimeout(() => {
      this.editTimers.delete(chatId);
      const text = this.pendingEditTexts.get(chatId);
      if (text === undefined) return;
      this.pendingEditTexts.delete(chatId);
      if (!this.messageIds.has(chatId)) return;
      void this.editNow(bot, chatId, text);
      this.lastEditAt.set(chatId, Date.now());
    }, Math.max(1, remaining));
    this.editTimers.set(chatId, timer);
  }

  async showErrorThenClear(bot: Bot, chatId: number): Promise<void> {
    await this.update(bot, chatId, '❌ 处理失败');
    this.clearErrorTimer(chatId);
    const timer = setTimeout(() => {
      this.errorTimers.delete(chatId);
      void this.clear(bot, chatId);
    }, ERROR_CLEAR_MS);
    this.errorTimers.set(chatId, timer);
  }

  async clear(bot: Bot, chatId: number): Promise<void> {
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
    if (messageId === undefined) return;
    try {
      await bot.api.deleteMessage(chatId, messageId);
    } catch {
      // The message may already be gone; ignore.
    }
  }

  dispose(): void {
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
  }

  private async editNow(bot: Bot, chatId: number, text: string): Promise<void> {
    const messageId = this.messageIds.get(chatId);
    if (messageId === undefined) return;
    try {
      await bot.api.editMessageText(chatId, messageId, text);
    } catch {
      // Ignore edit failures; the message may have been deleted already.
    }
  }

  private clearTimer(chatId: number): void {
    const timer = this.timers.get(chatId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(chatId);
    }
  }

  private clearEditTimer(chatId: number): void {
    const timer = this.editTimers.get(chatId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.editTimers.delete(chatId);
    }
  }

  private clearErrorTimer(chatId: number): void {
    const timer = this.errorTimers.get(chatId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.errorTimers.delete(chatId);
    }
  }

  private scheduleNext(bot: Bot, chatId: number, startedAt: number): void {
    const messageId = this.messageIds.get(chatId);
    if (messageId === undefined) return;

    const elapsed = Date.now() - startedAt;
    const delay = elapsed === 0 ? FIRST_HEARTBEAT_MS : HEARTBEAT_INTERVAL_MS;

    const timer = setTimeout(async () => {
      this.timers.delete(chatId);
      const currentId = this.messageIds.get(chatId);
      if (currentId === undefined || currentId !== messageId) return;

      const seconds = Math.round((Date.now() - (this.startedAt.get(chatId) ?? startedAt)) / 1000);
      const queueLen = this.queueLengths.get(chatId) ?? 0;
      const base = this.currentTexts.get(chatId) ?? '仍在处理中';
      let text = base;
      if (seconds >= LONG_WAIT_MS / 1000 && !text.includes('已处理')) {
        text += ` · 已处理 ${seconds}s`;
      }
      if (queueLen > 0) {
        text += ` · 队列还有 ${queueLen} 条`;
      }
      try {
        await bot.api.editMessageText(chatId, messageId, text);
      } catch {
        // Ignore edit failures; the message may have been deleted already.
      }

      this.scheduleNext(bot, chatId, startedAt);
    }, delay);

    this.timers.set(chatId, timer);
  }
}
