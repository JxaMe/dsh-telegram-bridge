import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
export class StateStore {
    statePath;
    settingsPath;
    state;
    settings;
    loaded = false;
    constructor(dataDir) {
        mkdirSync(dataDir, { recursive: true });
        this.statePath = path.join(dataDir, 'state.json');
        this.settingsPath = path.join(dataDir, 'settings.json');
        this.state = { chats: {} };
        this.settings = { chats: {} };
    }
    loadState() {
        this.ensureLoaded();
        return this.state;
    }
    saveState(state) {
        this.state = state;
        this.writeJson(this.statePath, state);
    }
    loadSettings() {
        this.ensureLoaded();
        return this.settings;
    }
    saveSettings(settings) {
        this.settings = settings;
        this.writeJson(this.settingsPath, settings);
    }
    getChatState(chatId) {
        return this.loadState().chats[String(chatId)];
    }
    setChatState(chatId, state) {
        const all = this.loadState();
        all.chats[String(chatId)] = state;
        this.writeJson(this.statePath, all);
    }
    getChatSettings(chatId) {
        const value = this.loadSettings().chats[String(chatId)];
        return value ? { ...value } : {};
    }
    setChatSettings(chatId, settings) {
        const all = this.loadSettings();
        all.chats[String(chatId)] = settings;
        this.writeJson(this.settingsPath, all);
    }
    ensureLoaded() {
        if (this.loaded)
            return;
        this.state = this.readJson(this.statePath, { chats: {} });
        this.settings = this.readJson(this.settingsPath, { chats: {} });
        this.loaded = true;
    }
    readJson(file, fallback) {
        try {
            return JSON.parse(readFileSync(file, 'utf8'));
        }
        catch {
            return fallback;
        }
    }
    writeJson(file, value) {
        const tmp = `${file}.tmp`;
        writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
        renameSync(tmp, file);
    }
}
