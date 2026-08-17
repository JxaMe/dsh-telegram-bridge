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
}

export interface QueueItem {
  chatId: number;
  text: string;
}
