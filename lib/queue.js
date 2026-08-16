import { createRpcId } from './rpc.js';
export class QueueManager {
    api;
    sessions;
    state;
    onError;
    queues = new Map();
    processing = new Map();
    constructor(api, sessions, state, onError) {
        this.api = api;
        this.sessions = sessions;
        this.state = state;
        this.onError = onError;
    }
    enqueue(chatId, text) {
        const queue = this.queues.get(chatId) ?? [];
        queue.push({ chatId, text });
        this.queues.set(chatId, queue);
        void this.drain(chatId);
    }
    clear(chatId) {
        this.queues.set(chatId, []);
    }
    queueLength(chatId) {
        return (this.queues.get(chatId) ?? []).length;
    }
    async drain(chatId) {
        if (this.processing.get(chatId))
            return;
        this.processing.set(chatId, true);
        try {
            while (true) {
                const queue = this.queues.get(chatId) ?? [];
                const item = queue.shift();
                if (!item)
                    break;
                this.queues.set(chatId, queue);
                try {
                    const settings = this.state.getChatSettings(chatId);
                    const sessionId = await this.sessions.ensureSession(chatId, settings);
                    const res = await this.api.sessions.prompt({
                        rpcId: createRpcId(),
                        payload: {
                            sessionId,
                            mode: 'queue',
                            content: [{ type: 'text', text: item.text }],
                        },
                    });
                    if (!res.result.ok) {
                        throw new Error(`prompt failed: ${JSON.stringify(res.result.error)}`);
                    }
                }
                catch (error) {
                    this.onError?.(chatId, error);
                }
            }
        }
        finally {
            this.processing.set(chatId, false);
        }
    }
}
