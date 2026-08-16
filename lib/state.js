import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export class StateStore {
    statePath;
    settingsPath;
    constructor(dataDir) {
        mkdirSync(dataDir, { recursive: true });
        this.statePath = path.join(dataDir, 'state.json');
        this.settingsPath = path.join(dataDir, 'settings.json');
    }
    loadState() {
        return this.readJson(this.statePath, { chats: {} });
    }
    saveState(state) {
        writeFileSync(this.statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
    }
    loadSettings() {
        return this.readJson(this.settingsPath, { chats: {} });
    }
    saveSettings(settings) {
        writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    }
    getChatState(chatId) {
        return this.loadState().chats[String(chatId)];
    }
    setChatState(chatId, state) {
        const all = this.loadState();
        all.chats[String(chatId)] = state;
        this.saveState(all);
    }
    getChatSettings(chatId) {
        return this.loadSettings().chats[String(chatId)] ?? {};
    }
    setChatSettings(chatId, settings) {
        const all = this.loadSettings();
        all.chats[String(chatId)] = settings;
        this.saveSettings(all);
    }
    readJson(file, fallback) {
        try {
            return JSON.parse(readFileSync(file, 'utf8'));
        }
        catch {
            return fallback;
        }
    }
}
