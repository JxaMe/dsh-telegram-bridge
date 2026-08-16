export class SessionManager {
    api;
    state;
    projectRoot;
    constructor(api, state, projectRoot) {
        this.api = api;
        this.state = state;
        this.projectRoot = projectRoot;
    }
    async ensureSession(chatId, settings) {
        const existing = this.state.getChatState(chatId);
        if (existing?.sessionId) {
            return existing.sessionId;
        }
        return this.createSession(chatId, settings);
    }
    async createSession(chatId, settings) {
        const res = await this.api.sessions.create({
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
    async resetSession(chatId, settings) {
        return this.createSession(chatId, settings);
    }
}
