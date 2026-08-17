import type { DshApi } from './dsh-types.js';
import { createRpcId } from './rpc.js';
import type { StateStore } from './state.js';
import type { ChatSettings } from './types.js';

export class SessionManager {
  constructor(
    private api: DshApi,
    private state: StateStore,
    private projectRoot: string,
    private defaults: Partial<ChatSettings> = {},
    private onCreated?: (chatId: number, sessionId: string) => void,
    private maxSessionsPerChat = 5,
  ) {}

  async ensureSession(chatId: number, settings: ChatSettings): Promise<string> {
    const existing = this.state.getChatState(chatId);
    if (existing?.sessionId) {
      return existing.sessionId;
    }
    return this.createSession(chatId, settings);
  }

  async createSession(chatId: number, settings: ChatSettings): Promise<string> {
    const res = await this.api.sessions.create({
      rpcId: createRpcId(),
      payload: {
        cwd: this.projectRoot,
        agentPreset: settings.agentPreset,
      },
    });
    if (!res.result.ok) {
      throw new Error(`create session failed: ${JSON.stringify(res.result.error)}`);
    }
    const sessionId = res.result.value.sessionId;
    const mergedSettings: ChatSettings = { ...this.defaults, ...settings };
    if (mergedSettings.provider && mergedSettings.model) {
      let effort = mergedSettings.reasoningEffort;
      let modelRes = await this.api.sessions.selectModel({
        rpcId: createRpcId(),
        payload: {
          sessionId,
          provider: mergedSettings.provider,
          model: mergedSettings.model,
          ...(effort ? { reasoningEffort: effort } : {}),
        },
      });
      // A stored reasoning effort can be unsupported by the selected model
      // (e.g. "max" on a model that only accepts lower levels). Retrying
      // without the effort lets the model's own default apply instead of
      // blocking every session reset (/new); persist the correction so the
      // next reset does not re-trip the same rejection.
      if (!modelRes.result.ok && effort) {
        const dropped = await this.api.sessions.selectModel({
          rpcId: createRpcId(),
          payload: {
            sessionId,
            provider: mergedSettings.provider,
            model: mergedSettings.model,
          },
        });
        if (dropped.result.ok) {
          modelRes = dropped;
          delete mergedSettings.reasoningEffort;
        }
      }
      if (!modelRes.result.ok) {
        throw new Error(`selectModel failed: ${JSON.stringify(modelRes.result.error)}`);
      }
    }
    this.state.addSession(chatId, sessionId);
    this.state.trimSessions(chatId, this.maxSessionsPerChat);
    if (Object.keys(mergedSettings).length > 0) {
      this.state.setChatSettings(chatId, mergedSettings);
    }
    this.onCreated?.(chatId, sessionId);
    return sessionId;
  }

  async resetSession(chatId: number, settings: ChatSettings): Promise<string> {
    return this.createSession(chatId, settings);
  }
}
