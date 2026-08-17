export type ErrorDisplayMode = 'raw' | 'friendly';
export interface PluginConfig {
    botToken: string;
    ownerId: number;
    projectRoot?: string;
    dataDir?: string;
    proxyEnabled?: boolean;
    proxyUrl?: string;
    defaultProvider?: string;
    defaultModel?: string;
    defaultReasoningEffort?: string;
    defaultAgentPreset?: string;
    errorDisplayMode?: ErrorDisplayMode;
    htmlFormatting?: boolean;
    typingIndicator?: boolean;
    queueLimit?: number;
    debugLogging?: boolean;
    statusLine?: boolean;
    maxSessionsPerChat?: number;
}
export interface SessionRecord {
    sessionId: string;
    createdAt: number;
    lastActiveAt?: number;
    title?: string;
}
export interface ChatState {
    sessionId: string;
    createdAt: number;
    lastActiveAt?: number;
    lastUserMessage?: string;
    sessions?: SessionRecord[];
}
export interface ChatSettings {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
    agentPreset?: string;
    agentPresetName?: string;
}
export interface ChatStats {
    userMessages: number;
    assistantMessages: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
export interface PersistedState {
    chats: Record<string, ChatState>;
    stats?: Record<string, ChatStats>;
}
export interface PersistedSettings {
    chats: Record<string, ChatSettings>;
    sessions?: Record<string, ChatSettings>;
}
export interface QueueItem {
    chatId: number;
    text: string;
}
