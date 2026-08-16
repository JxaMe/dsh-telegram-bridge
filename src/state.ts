import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ChatSettings, ChatState, ChatStats, PersistedSettings, PersistedState } from './types.js';

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

  getChatSettings(chatId: number): ChatSettings {
    const value = this.loadSettings().chats[String(chatId)];
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
    all.chats[String(chatId)] = settings;
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
      return fallback;
    }
  }

  private writeJson(file: string, value: unknown): void {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
    renameSync(tmp, file);
  }
}
