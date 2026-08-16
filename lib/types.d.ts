export interface PluginConfig {
    botToken: string;
    ownerId: number;
    projectRoot?: string;
    dataDir?: string;
}
export interface ChatState {
    sessionId: string;
    createdAt: number;
}
export interface ChatSettings {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
    agentPreset?: string;
}
export interface PersistedState {
    chats: Record<string, ChatState>;
}
export interface PersistedSettings {
    chats: Record<string, ChatSettings>;
}
export interface QueueItem {
    chatId: number;
    text: string;
}
