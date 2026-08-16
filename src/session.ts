import type { DshApi } from './dsh-types.js';
import { createRpcId } from './rpc.js';
import type { StateStore } from './state.js';
import type { ChatSettings } from './types.js';

export class SessionManager {
  constructor(
    private api: DshApi,
    private state: StateStore,
    private projectRoot: string,
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
    this.state.setChatState(chatId, { sessionId, createdAt: Date.now() });
    return sessionId;
  }

  async resetSession(chatId: number, settings: ChatSettings): Promise<string> {
    return this.createSession(chatId, settings);
  }
}
