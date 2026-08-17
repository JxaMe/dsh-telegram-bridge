import { createRpcId } from './rpc.js';
export class SettingsManager {
    api;
    state;
    constructor(api, state) {
        this.api = api;
        this.state = state;
    }
    async getModels(sessionId) {
        const res = await this.api.sessions.models({ rpcId: createRpcId(), payload: { sessionId } });
        if (!res.result.ok) {
            throw new Error(`models failed: ${JSON.stringify(res.result.error)}`);
        }
        return res.result.value;
    }
    async selectModel(chatId, sessionId, provider, model, reasoningEffort) {
        const res = await this.api.sessions.selectModel({
            rpcId: createRpcId(),
            payload: {
                sessionId,
                provider,
                model,
                ...(reasoningEffort ? { reasoningEffort } : {}),
            },
        });
        if (!res.result.ok) {
            throw new Error(`selectModel failed: ${JSON.stringify(res.result.error)}`);
        }
        const settings = this.state.getChatSettings(chatId);
        settings.provider = provider;
        settings.model = model;
        if (reasoningEffort)
            settings.reasoningEffort = reasoningEffort;
        this.state.setChatSettings(chatId, settings);
    }
    async listPresets() {
        const res = await this.api.agentPresets.list({ rpcId: createRpcId(), payload: {} });
        if (!res.result.ok) {
            throw new Error(`presets failed: ${JSON.stringify(res.result.error)}`);
        }
        return res.result.value.presets;
    }
    async selectPreset(chatId, sessionId, agentPreset) {
        const res = await this.api.agentPresets.select({
            rpcId: createRpcId(),
            payload: { sessionId, agentPreset },
        });
        if (!res.result.ok) {
            if (res.result.error.code === 'agent-preset-locked') {
                throw new Error('当前会话已有历史，请先使用 /new 开始新对话后再切换 preset');
            }
            throw new Error(`selectPreset failed: ${JSON.stringify(res.result.error)}`);
        }
        const settings = this.state.getChatSettings(chatId);
        settings.agentPreset = agentPreset;
        try {
            const presets = await this.listPresets();
            const preset = presets.find((entry) => entry.id === agentPreset);
            settings.agentPresetName = preset?.name ?? agentPreset;
        }
        catch {
            settings.agentPresetName = agentPreset;
        }
        this.state.setChatSettings(chatId, settings);
    }
}
