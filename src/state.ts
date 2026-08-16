import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ChatSettings, ChatState, PersistedSettings, PersistedState } from './types.js';

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
    this.state = { chats: {} };
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

  setChatSettings(chatId: number, settings: ChatSettings): void {
    const all = this.loadSettings();
    all.chats[String(chatId)] = settings;
    this.writeJson(this.settingsPath, all);
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.state = this.readJson<PersistedState>(this.statePath, { chats: {} });
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
