import type { DshApi, DshSessionModels } from './dsh-types.js';
import type { StateStore } from './state.js';
import type { ChatSettings } from './types.js';

export class SettingsManager {
  constructor(
    private api: DshApi,
    private state: StateStore,
  ) {}

  async getModels(sessionId: string): Promise<DshSessionModels> {
    const res = await this.api.sessions.models({ payload: { sessionId } });
    if (!res.ok) {
      throw new Error(`models failed: ${JSON.stringify(res.error)}`);
    }
    return res.value;
  }

  async selectModel(
    chatId: number,
    sessionId: string,
    provider: string,
    model: string,
    reasoningEffort?: string,
  ): Promise<void> {
    const res = await this.api.sessions.selectModel({
      payload: {
        sessionId,
        provider,
        model,
        ...(reasoningEffort ? { reasoningEffort } : {}),
      },
    });
    if (!res.ok) {
      throw new Error(`selectModel failed: ${JSON.stringify(res.error)}`);
    }
    const settings: ChatSettings = this.state.getChatSettings(chatId);
    settings.provider = provider;
    settings.model = model;
    if (reasoningEffort) settings.reasoningEffort = reasoningEffort;
    this.state.setChatSettings(chatId, settings);
  }

  async listPresets() {
    const res = await this.api.agentPresets.list({ payload: {} });
    if (!res.ok) {
      throw new Error(`presets failed: ${JSON.stringify(res.error)}`);
    }
    return res.value.presets;
  }

  async selectPreset(chatId: number, sessionId: string, agentPreset: string): Promise<void> {
    const res = await this.api.agentPresets.select({
      payload: { sessionId, agentPreset },
    });
    if (!res.ok) {
      if (res.error.code === 'agent-preset-locked') {
        throw new Error('当前会话已有历史，请先使用 /new 开始新对话后再切换 preset');
      }
      throw new Error(`selectPreset failed: ${JSON.stringify(res.error)}`);
    }
    const settings: ChatSettings = this.state.getChatSettings(chatId);
    settings.agentPreset = agentPreset;
    this.state.setChatSettings(chatId, settings);
  }
}
