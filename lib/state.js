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
        this.state = { chats: {}, stats: {} };
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
    getChatStats(chatId) {
        const all = this.loadState();
        return all.stats?.[String(chatId)] ?? {
            userMessages: 0,
            assistantMessages: 0,
            inputTokens: 0,
            outputTokens: 0,
        };
    }
    incrementUserMessage(chatId) {
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
    addAssistantMessage(chatId, usage) {
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
    setChatSettings(chatId, settings) {
        const all = this.loadSettings();
        all.chats[String(chatId)] = settings;
        this.writeJson(this.settingsPath, all);
    }
    ensureLoaded() {
        if (this.loaded)
            return;
        this.state = this.readJson(this.statePath, { chats: {}, stats: {} });
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
