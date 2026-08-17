import type { ChatSettings, ChatState, ChatStats, PersistedSettings, PersistedState, SessionRecord } from './types.js';
export declare class StateStore {
    private statePath;
    private settingsPath;
    private state;
    private settings;
    private loaded;
    constructor(dataDir: string);
    loadState(): PersistedState;
    saveState(state: PersistedState): void;
    loadSettings(): PersistedSettings;
    saveSettings(settings: PersistedSettings): void;
    getChatState(chatId: number): ChatState | undefined;
    setChatState(chatId: number, state: ChatState): void;
    listChatSessions(chatId: number): SessionRecord[];
    addSession(chatId: number, sessionId: string, title?: string): void;
    setActiveSession(chatId: number, sessionId: string): void;
    ensureSessionTitle(chatId: number, sessionId: string, title: string): void;
    pruneOldSessions(maxAgeDays?: number): void;
    trimSessions(chatId: number, max: number): void;
    getChatSettings(chatId: number): ChatSettings;
    getSessionSettings(sessionId: string): ChatSettings;
    getChatStats(chatId: number): ChatStats;
    incrementUserMessage(chatId: number): void;
    addAssistantMessage(chatId: number, usage?: {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    }): void;
    setChatSettings(chatId: number, settings: ChatSettings): void;
    setSessionSettings(sessionId: string, settings: ChatSettings): void;
    private ensureLoaded;
    private readJson;
    private writeJson;
}
