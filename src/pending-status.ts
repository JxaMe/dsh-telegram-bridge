import type { Bot } from 'grammy';

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

interface PendingChatState {
  messageId?: number;
  timer?: ReturnType<typeof setTimeout>;
  startedAt?: number;
  queueLength: number;
  currentText?: string;
  lastEditAt?: number;
  pendingEditText?: string;
  editTimer?: ReturnType<typeof setTimeout>;
  errorTimer?: ReturnType<typeof setTimeout>;
  activeTool?: string;
  activityIndex: number;
}

/**
 * Tracks the per-chat status message ("Deep diving..." / "thinking...") so it
 * can be updated in place, rate-limited, and removed when the reply arrives.
 */
export class PendingStatus {
  private chats = new Map<number, PendingChatState>();

  has(chatId: number): boolean {
    const chat = this.chats.get(chatId);
    return chat?.messageId !== undefined;
  }

  set(bot: Bot, chatId: number, messageId: number, queueLength = 0, text = '🐋 Deep diving...'): void {
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

  update(bot: Bot, chatId: number, text: string): void {
    const chat = this.chats.get(chatId);
    if (!chat?.messageId) return;
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
    if (chat.editTimer) return;
    const remaining = EDIT_COOLDOWN_MS - (now - last);
    const timer = setTimeout(() => {
      chat.editTimer = undefined;
      const text = chat.pendingEditText;
      if (text === undefined) return;
      chat.pendingEditText = undefined;
      if (!chat.messageId) return;
      void this.editNow(bot, chatId, text);
      chat.lastEditAt = Date.now();
    }, Math.max(1, remaining));
    chat.editTimer = timer;
  }

  setQueueLength(chatId: number, length: number): void {
    const chat = this.chats.get(chatId);
    if (chat) chat.queueLength = length;
  }

  setActiveTool(chatId: number, name: string): void {
    const chat = this.chats.get(chatId);
    if (chat) chat.activeTool = name;
  }

  clearActiveTool(chatId: number): void {
    const chat = this.chats.get(chatId);
    if (chat) chat.activeTool = undefined;
  }

  async showErrorThenClear(bot: Bot, chatId: number): Promise<void> {
    await this.update(bot, chatId, '❌ 处理失败');
    this.clearErrorTimer(chatId);
    const chat = this.chats.get(chatId);
    if (!chat) return;
    const timer = setTimeout(() => {
      chat.errorTimer = undefined;
      void this.clear(bot, chatId);
    }, ERROR_CLEAR_MS);
    chat.errorTimer = timer;
  }

  async clear(bot: Bot, chatId: number): Promise<void> {
    this.clearTimer(chatId);
    this.clearEditTimer(chatId);
    this.clearErrorTimer(chatId);
    const chat = this.chats.get(chatId);
    this.chats.delete(chatId);
    if (!chat?.messageId) return;
    try {
      await bot.api.deleteMessage(chatId, chat.messageId);
    } catch {
      // The message may already be gone; ignore.
    }
  }

  dispose(): void {
    for (const chatId of this.chats.keys()) {
      this.clearTimer(chatId);
      this.clearEditTimer(chatId);
      this.clearErrorTimer(chatId);
    }
    this.chats.clear();
  }

  private async editNow(bot: Bot, chatId: number, text: string): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat?.messageId) return;
    try {
      await bot.api.editMessageText(chatId, chat.messageId, text);
    } catch {
      // Ignore edit failures; the message may have been deleted already.
    }
  }

  private clearTimer(chatId: number): void {
    const chat = this.chats.get(chatId);
    if (chat?.timer) {
      clearTimeout(chat.timer);
      chat.timer = undefined;
    }
  }

  private clearEditTimer(chatId: number): void {
    const chat = this.chats.get(chatId);
    if (chat?.editTimer) {
      clearTimeout(chat.editTimer);
      chat.editTimer = undefined;
    }
  }

  private clearErrorTimer(chatId: number): void {
    const chat = this.chats.get(chatId);
    if (chat?.errorTimer) {
      clearTimeout(chat.errorTimer);
      chat.errorTimer = undefined;
    }
  }

  private scheduleNext(bot: Bot, chatId: number, startedAt: number): void {
    const chat = this.chats.get(chatId);
    if (!chat?.messageId) return;

    const elapsed = Date.now() - startedAt;
    const delay = elapsed === 0 ? FIRST_HEARTBEAT_MS : HEARTBEAT_INTERVAL_MS;

    const timer = setTimeout(async () => {
      chat.timer = undefined;
      const currentChat = this.chats.get(chatId);
      if (!currentChat?.messageId || currentChat.messageId !== chat.messageId) return;

      const queueLen = currentChat.queueLength;
      let text: string;
      const activeTool = currentChat.activeTool;
      if (activeTool !== undefined) {
        text = `正在调用工具：${activeTool}`;
      } else {
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
