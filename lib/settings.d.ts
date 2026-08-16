import type { DshApi, DshSessionModels } from './dsh-types.js';
import type { StateStore } from './state.js';
export declare class SettingsManager {
    private api;
    private state;
    constructor(api: DshApi, state: StateStore);
    getModels(sessionId: string): Promise<DshSessionModels>;
    selectModel(chatId: number, sessionId: string, provider: string, model: string, reasoningEffort?: string): Promise<void>;
    listPresets(): Promise<import("./dsh-types.js").DshPresetEntry[]>;
    selectPreset(chatId: number, sessionId: string, agentPreset: string): Promise<void>;
}
