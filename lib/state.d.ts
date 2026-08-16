import type { ChatSettings, ChatState, PersistedSettings, PersistedState } from './types.js';
export declare class StateStore {
    private statePath;
    private settingsPath;
    constructor(dataDir: string);
    loadState(): PersistedState;
    saveState(state: PersistedState): void;
    loadSettings(): PersistedSettings;
    saveSettings(settings: PersistedSettings): void;
    getChatState(chatId: number): ChatState | undefined;
    setChatState(chatId: number, state: ChatState): void;
    getChatSettings(chatId: number): ChatSettings;
    setChatSettings(chatId: number, settings: ChatSettings): void;
    private readJson;
}
