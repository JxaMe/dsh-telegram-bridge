import { createRpcId } from './rpc.js';
export class QueueManager {
    api;
    sessions;
    state;
    onError;
    maxQueueSize;
    queues = new Map();
    processing = new Map();
    constructor(api, sessions, state, onError, maxQueueSize = 20) {
        this.api = api;
        this.sessions = sessions;
        this.state = state;
        this.onError = onError;
        this.maxQueueSize = maxQueueSize;
    }
    enqueue(chatId, text) {
        const queue = this.queues.get(chatId) ?? [];
        if (this.maxQueueSize > 0 && queue.length >= this.maxQueueSize) {
            return false;
        }
        queue.push({ chatId, text });
        this.queues.set(chatId, queue);
        void this.drain(chatId);
        return true;
    }
    clear(chatId) {
        this.queues.set(chatId, []);
    }
    queueLength(chatId) {
        return (this.queues.get(chatId) ?? []).length;
    }
    isProcessing(chatId) {
        return this.processing.get(chatId) ?? false;
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
                    let sessionId = await this.sessions.ensureSession(chatId, settings);
                    let res = await this.api.sessions.prompt({
                        rpcId: createRpcId(),
                        payload: {
                            sessionId,
                            mode: 'queue',
                            content: [{ type: 'text', text: item.text }],
                        },
                    });
                    if (!res.result.ok && res.result.error.code === 'session-not-found') {
                        sessionId = await this.sessions.resetSession(chatId, settings);
                        res = await this.api.sessions.prompt({
                            rpcId: createRpcId(),
                            payload: {
                                sessionId,
                                mode: 'queue',
                                content: [{ type: 'text', text: item.text }],
                            },
                        });
                    }
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
