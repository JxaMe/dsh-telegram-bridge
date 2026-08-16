import type { ChatSettings, ChatState, ChatStats, PersistedSettings, PersistedState } from './types.js';
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
    getChatSettings(chatId: number): ChatSettings;
    getChatStats(chatId: number): ChatStats;
    incrementUserMessage(chatId: number): void;
    addAssistantMessage(chatId: number, usage?: {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    }): void;
    setChatSettings(chatId: number, settings: ChatSettings): void;
    private ensureLoaded;
    private readJson;
    private writeJson;
}
