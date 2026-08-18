import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
    listChatSessions(chatId) {
        const chat = this.getChatState(chatId);
        if (!chat)
            return [];
        if (chat.sessions && chat.sessions.length > 0)
            return chat.sessions;
        return chat.sessionId ? [{ sessionId: chat.sessionId, createdAt: chat.createdAt, lastActiveAt: chat.lastActiveAt }] : [];
    }
    addSession(chatId, sessionId, title) {
        const all = this.loadState();
        const key = String(chatId);
        const chat = all.chats[key] ?? { sessionId: '', createdAt: Date.now() };
        const sessions = chat.sessions ?? [];
        const existingIndex = sessions.findIndex((entry) => entry.sessionId === sessionId);
        if (existingIndex >= 0) {
            sessions[existingIndex] = { ...sessions[existingIndex], lastActiveAt: Date.now(), title: title ?? sessions[existingIndex].title };
        }
        else {
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
    setActiveSession(chatId, sessionId) {
        const all = this.loadState();
        const key = String(chatId);
        const chat = all.chats[key];
        if (!chat)
            return;
        const sessions = chat.sessions ?? [];
        const sessionsUpdated = sessions.map((entry) => entry.sessionId === sessionId ? { ...entry, lastActiveAt: Date.now() } : entry);
        if (!sessionsUpdated.some((entry) => entry.sessionId === sessionId)) {
            sessionsUpdated.push({ sessionId, createdAt: Date.now(), lastActiveAt: Date.now() });
        }
        all.chats[key] = { ...chat, sessionId, lastActiveAt: Date.now(), sessions: sessionsUpdated };
        this.writeJson(this.statePath, all);
    }
    ensureSessionTitle(chatId, sessionId, title) {
        const all = this.loadState();
        const key = String(chatId);
        const chat = all.chats[key];
        if (!chat)
            return;
        const sessions = chat.sessions ?? [{ sessionId: chat.sessionId, createdAt: chat.createdAt, lastActiveAt: chat.lastActiveAt }];
        const index = sessions.findIndex((entry) => entry.sessionId === sessionId);
        if (index >= 0 && !sessions[index].title) {
            sessions[index] = { ...sessions[index], title };
            all.chats[key] = { ...chat, sessions };
            this.writeJson(this.statePath, all);
        }
    }
    pruneOldSessions(maxAgeDays = 7) {
        const all = this.loadState();
        const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
        let changed = false;
        for (const [key, chat] of Object.entries(all.chats)) {
            if (!chat.sessions)
                continue;
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
            if (sessions.length === chat.sessions.length && !activeChanged)
                continue;
            chat.sessions = sessions;
            changed = true;
        }
        if (changed)
            this.writeJson(this.statePath, all);
    }
    trimSessions(chatId, max) {
        if (max <= 0)
            return;
        const all = this.loadState();
        const key = String(chatId);
        const chat = all.chats[key];
        if (!chat?.sessions || chat.sessions.length <= max)
            return;
        const removed = chat.sessions.slice(0, chat.sessions.length - max);
        const remaining = chat.sessions.slice(chat.sessions.length - max);
        if (remaining.some((entry) => entry.sessionId === chat.sessionId)) {
            all.chats[key] = { ...chat, sessions: remaining };
        }
        else {
            const active = remaining[remaining.length - 1];
            all.chats[key] = { ...chat, sessions: remaining, sessionId: active.sessionId, createdAt: active.createdAt, lastActiveAt: active.lastActiveAt };
        }
        // Keep removed settings around; they are just not listed.
        void removed;
        this.writeJson(this.statePath, all);
    }
    getChatSettings(chatId) {
        const chat = this.getChatState(chatId);
        const settings = this.loadSettings();
        if (chat?.sessionId && settings.sessions?.[chat.sessionId]) {
            return { ...settings.sessions[chat.sessionId] };
        }
        const value = settings.chats[String(chatId)];
        return value ? { ...value } : {};
    }
    getSessionSettings(sessionId) {
        const value = this.loadSettings().sessions?.[sessionId];
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
    updateAssistantMessageAndChatState(chatId, usage, chatState) {
        const all = this.loadState();
        const key = String(chatId);
        // Update stats
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
        // Update chat state if provided
        if (chatState) {
            all.chats[key] = chatState;
        }
        this.writeJson(this.statePath, all);
    }
    setChatSettings(chatId, settings) {
        const all = this.loadSettings();
        const chat = this.getChatState(chatId);
        if (chat?.sessionId) {
            all.sessions ??= {};
            all.sessions[chat.sessionId] = settings;
        }
        else {
            all.chats[String(chatId)] = settings;
        }
        this.writeJson(this.settingsPath, all);
    }
    setSessionSettings(sessionId, settings) {
        const all = this.loadSettings();
        all.sessions ??= {};
        all.sessions[sessionId] = settings;
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
            try {
                return JSON.parse(readFileSync(`${file}.bak`, 'utf8'));
            }
            catch {
                return fallback;
            }
        }
    }
    writeJson(file, value) {
        if (existsSync(file)) {
            try {
                copyFileSync(file, `${file}.bak`);
            }
            catch {
                // Backup is best-effort; never block writes on backup failure.
            }
        }
        const tmp = `${file}.tmp`;
        writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
        renameSync(tmp, file);
    }
}
