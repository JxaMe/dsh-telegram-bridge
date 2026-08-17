import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRpcId } from './rpc.js';
export class QueueManager {
    api;
    sessions;
    state;
    onError;
    maxQueueSize;
    dataDir;
    queues = new Map();
    processing = new Map();
    failedItems = new Map();
    constructor(api, sessions, state, onError, maxQueueSize = 20, dataDir) {
        this.api = api;
        this.sessions = sessions;
        this.state = state;
        this.onError = onError;
        this.maxQueueSize = maxQueueSize;
        this.dataDir = dataDir;
        this.loadQueues();
        for (const chatId of this.queues.keys()) {
            void this.drain(chatId);
        }
    }
    enqueue(chatId, text) {
        const queue = this.queues.get(chatId) ?? [];
        if (this.maxQueueSize > 0 && queue.length >= this.maxQueueSize) {
            return false;
        }
        queue.push({ chatId, text });
        this.queues.set(chatId, queue);
        this.persistQueues();
        void this.drain(chatId);
        return true;
    }
    clear(chatId) {
        this.queues.set(chatId, []);
        this.persistQueues();
    }
    queueLength(chatId) {
        return (this.queues.get(chatId) ?? []).length;
    }
    isProcessing(chatId) {
        return this.processing.get(chatId) ?? false;
    }
    getFailedItem(chatId, failureId) {
        return this.failedItems.get(chatId)?.get(failureId);
    }
    listFailedItems(chatId) {
        const map = this.failedItems.get(chatId);
        if (!map)
            return [];
        return Array.from(map.entries()).map(([id, item]) => ({ id, item }));
    }
    clearFailedItem(chatId, failureId) {
        const map = this.failedItems.get(chatId);
        if (!map)
            return;
        map.delete(failureId);
        if (map.size === 0)
            this.failedItems.delete(chatId);
    }
    loadQueues() {
        if (!this.dataDir)
            return;
        try {
            const file = path.join(this.dataDir, 'queue.json');
            if (!existsSync(file))
                return;
            const parsed = JSON.parse(readFileSync(file, 'utf8'));
            for (const [chatId, items] of Object.entries(parsed)) {
                if (Array.isArray(items)) {
                    this.queues.set(Number(chatId), items.filter((item) => item && typeof item.text === 'string'));
                }
            }
        }
        catch {
            // A corrupted queue file is ignored; the queue just starts empty.
        }
    }
    persistQueues() {
        if (!this.dataDir)
            return;
        try {
            mkdirSync(this.dataDir, { recursive: true });
            const file = path.join(this.dataDir, 'queue.json');
            const tmp = `${file}.tmp`;
            const data = {};
            for (const [chatId, items] of this.queues) {
                if (items.length > 0)
                    data[String(chatId)] = items;
            }
            writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
            renameSync(tmp, file);
        }
        catch {
            // Persistence is best-effort; never break the queue on write failure.
        }
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
                this.persistQueues();
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
                    const failureId = createRpcId();
                    const map = this.failedItems.get(chatId) ?? new Map();
                    map.set(failureId, item);
                    this.failedItems.set(chatId, map);
                    this.onError?.(chatId, error, failureId);
                }
            }
        }
        finally {
            this.processing.set(chatId, false);
        }
    }
}
