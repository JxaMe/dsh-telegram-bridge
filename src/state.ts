import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ChatSettings, ChatState, ChatStats, PersistedSettings, PersistedState, SessionRecord } from './types.js';

export class StateStore {
  private statePath: string;
  private settingsPath: string;
  private state: PersistedState;
  private settings: PersistedSettings;
  private loaded = false;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.statePath = path.join(dataDir, 'state.json');
    this.settingsPath = path.join(dataDir, 'settings.json');
    this.state = { chats: {}, stats: {} };
    this.settings = { chats: {} };
  }

  loadState(): PersistedState {
    this.ensureLoaded();
    return this.state;
  }

  saveState(state: PersistedState): void {
    this.state = state;
    this.writeJson(this.statePath, state);
  }

  loadSettings(): PersistedSettings {
    this.ensureLoaded();
    return this.settings;
  }

  saveSettings(settings: PersistedSettings): void {
    this.settings = settings;
    this.writeJson(this.settingsPath, settings);
  }

  getChatState(chatId: number): ChatState | undefined {
    return this.loadState().chats[String(chatId)];
  }

  setChatState(chatId: number, state: ChatState): void {
    const all = this.loadState();
    all.chats[String(chatId)] = state;
    this.writeJson(this.statePath, all);
  }

  listChatSessions(chatId: number): SessionRecord[] {
    const chat = this.getChatState(chatId);
    if (!chat) return [];
    if (chat.sessions && chat.sessions.length > 0) return chat.sessions;
    return chat.sessionId ? [{ sessionId: chat.sessionId, createdAt: chat.createdAt, lastActiveAt: chat.lastActiveAt }] : [];
  }

  addSession(chatId: number, sessionId: string, title?: string): void {
    const all = this.loadState();
    const key = String(chatId);
    const chat = all.chats[key] ?? { sessionId: '', createdAt: Date.now() };
    const sessions = chat.sessions ?? [];
    const existingIndex = sessions.findIndex((entry) => entry.sessionId === sessionId);
    if (existingIndex >= 0) {
      sessions[existingIndex] = { ...sessions[existingIndex], lastActiveAt: Date.now(), title: title ?? sessions[existingIndex].title };
    } else {
      sessions.push({ sessionId, createdAt: Date.now(), lastActiveAt: Date.now(), title });
    }
    all.chats[key] = {
      ...chat,
      sessionId,
      createdAt: chat.createdAt ?? Date.now(),
      lastActiveAt: Date.now(),
      sessions,
    };
    this.writeJson(this.statePath, all);
  }

  setActiveSession(chatId: number, sessionId: string): void {
    const all = this.loadState();
    const key = String(chatId);
    const chat = all.chats[key];
    if (!chat) return;
    const sessions = chat.sessions ?? [];
    const sessionsUpdated = sessions.map((entry) => entry.sessionId === sessionId ? { ...entry, lastActiveAt: Date.now() } : entry);
    if (!sessionsUpdated.some((entry) => entry.sessionId === sessionId)) {
      sessionsUpdated.push({ sessionId, createdAt: Date.now(), lastActiveAt: Date.now() });
    }
    all.chats[key] = { ...chat, sessionId, lastActiveAt: Date.now(), sessions: sessionsUpdated };
    this.writeJson(this.statePath, all);
  }

  ensureSessionTitle(chatId: number, sessionId: string, title: string): void {
    const all = this.loadState();
    const key = String(chatId);
    const chat = all.chats[key];
    if (!chat) return;
    const sessions = chat.sessions ?? [{ sessionId: chat.sessionId, createdAt: chat.createdAt, lastActiveAt: chat.lastActiveAt }];
    const index = sessions.findIndex((entry) => entry.sessionId === sessionId);
    if (index >= 0 && !sessions[index].title) {
      sessions[index] = { ...sessions[index], title };
      all.chats[key] = { ...chat, sessions };
      this.writeJson(this.statePath, all);
    }
  }

  pruneOldSessions(maxAgeDays = 7): void {
    const all = this.loadState();
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    let changed = false;
    for (const [key, chat] of Object.entries(all.chats)) {
      if (!chat.sessions) continue;
      const sessions = chat.sessions.filter((entry) => {
        const last = entry.lastActiveAt ?? entry.createdAt;
        return last >= cutoff;
      });
      const activeStillPresent = sessions.some((entry) => entry.sessionId === chat.sessionId);
      let activeChanged = false;
      if (!activeStillPresent) {
        const fallback = sessions[sessions.length - 1];
        if (fallback) {
          chat.sessionId = fallback.sessionId;
          chat.createdAt = fallback.createdAt;
          chat.lastActiveAt = fallback.lastActiveAt;
          activeChanged = true;
        }
      }
      if (sessions.length === chat.sessions.length && !activeChanged) continue;
      chat.sessions = sessions;
      changed = true;
    }
    if (changed) this.writeJson(this.statePath, all);
  }

  trimSessions(chatId: number, max: number): void {
    if (max <= 0) return;
    const all = this.loadState();
    const key = String(chatId);
    const chat = all.chats[key];
    if (!chat?.sessions || chat.sessions.length <= max) return;
    const removed = chat.sessions.slice(0, chat.sessions.length - max);
    const remaining = chat.sessions.slice(chat.sessions.length - max);
    if (remaining.some((entry) => entry.sessionId === chat.sessionId)) {
      all.chats[key] = { ...chat, sessions: remaining };
    } else {
      const active = remaining[remaining.length - 1];
      all.chats[key] = { ...chat, sessions: remaining, sessionId: active.sessionId, createdAt: active.createdAt, lastActiveAt: active.lastActiveAt };
    }
    // Keep removed settings around; they are just not listed.
    void removed;
    this.writeJson(this.statePath, all);
  }

  getChatSettings(chatId: number): ChatSettings {
    const chat = this.getChatState(chatId);
    const settings = this.loadSettings();
    if (chat?.sessionId && settings.sessions?.[chat.sessionId]) {
      return { ...settings.sessions[chat.sessionId] };
    }
    const value = settings.chats[String(chatId)];
    return value ? { ...value } : {};
  }

  getSessionSettings(sessionId: string): ChatSettings {
    const value = this.loadSettings().sessions?.[sessionId];
    return value ? { ...value } : {};
  }

  getChatStats(chatId: number): ChatStats {
    const all = this.loadState();
    return all.stats?.[String(chatId)] ?? {
      userMessages: 0,
      assistantMessages: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  incrementUserMessage(chatId: number): void {
    const all = this.loadState();
    const key = String(chatId);
    const stats = all.stats?.[key] ?? {
      userMessages: 0,
      assistantMessages: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    stats.userMessages += 1;
    all.stats ??= {};
    all.stats[key] = stats;
    this.writeJson(this.statePath, all);
  }

  addAssistantMessage(chatId: number, usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number }): void {
    const all = this.loadState();
    const key = String(chatId);
    const stats = all.stats?.[key] ?? {
      userMessages: 0,
      assistantMessages: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    stats.assistantMessages += 1;
    if (usage) {
      stats.inputTokens += usage.inputTokens ?? 0;
      stats.outputTokens += usage.outputTokens ?? 0;
      if (usage.cacheReadTokens !== undefined) {
        stats.cacheReadTokens = (stats.cacheReadTokens ?? 0) + usage.cacheReadTokens;
      }
      if (usage.cacheWriteTokens !== undefined) {
        stats.cacheWriteTokens = (stats.cacheWriteTokens ?? 0) + usage.cacheWriteTokens;
      }
    }
    all.stats ??= {};
    all.stats[key] = stats;
    this.writeJson(this.statePath, all);
  }

  setChatSettings(chatId: number, settings: ChatSettings): void {
    const all = this.loadSettings();
    const chat = this.getChatState(chatId);
    if (chat?.sessionId) {
      all.sessions ??= {};
      all.sessions[chat.sessionId] = settings;
    } else {
      all.chats[String(chatId)] = settings;
    }
    this.writeJson(this.settingsPath, all);
  }

  setSessionSettings(sessionId: string, settings: ChatSettings): void {
    const all = this.loadSettings();
    all.sessions ??= {};
    all.sessions[sessionId] = settings;
    this.writeJson(this.settingsPath, all);
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.state = this.readJson<PersistedState>(this.statePath, { chats: {}, stats: {} });
    this.settings = this.readJson<PersistedSettings>(this.settingsPath, { chats: {} });
    this.loaded = true;
  }

  private readJson<T>(file: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch {
      try {
        return JSON.parse(readFileSync(`${file}.bak`, 'utf8')) as T;
      } catch {
        return fallback;
      }
    }
  }

  private writeJson(file: string, value: unknown): void {
    if (existsSync(file)) {
      try {
        copyFileSync(file, `${file}.bak`);
      } catch {
        // Backup is best-effort; never block writes on backup failure.
      }
    }
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    renameSync(tmp, file);
  }
}
