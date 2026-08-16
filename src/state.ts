import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ChatSettings, ChatState, PersistedSettings, PersistedState } from './types.js';

export class StateStore {
  private statePath: string;
  private settingsPath: string;

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.statePath = path.join(dataDir, 'state.json');
    this.settingsPath = path.join(dataDir, 'settings.json');
  }

  loadState(): PersistedState {
    return this.readJson<PersistedState>(this.statePath, { chats: {} });
  }

  saveState(state: PersistedState): void {
    writeFileSync(this.statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }

  loadSettings(): PersistedSettings {
    return this.readJson<PersistedSettings>(this.settingsPath, { chats: {} });
  }

  saveSettings(settings: PersistedSettings): void {
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }

  getChatState(chatId: number): ChatState | undefined {
    return this.loadState().chats[String(chatId)];
  }

  setChatState(chatId: number, state: ChatState): void {
    const all = this.loadState();
    all.chats[String(chatId)] = state;
    this.saveState(all);
  }

  getChatSettings(chatId: number): ChatSettings {
    return this.loadSettings().chats[String(chatId)] ?? {};
  }

  setChatSettings(chatId: number, settings: ChatSettings): void {
    const all = this.loadSettings();
    all.chats[String(chatId)] = settings;
    this.saveSettings(all);
  }

  private readJson<T>(file: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch {
      return fallback;
    }
  }
}
