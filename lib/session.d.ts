import type { DshApi } from './dsh-types.js';
import type { StateStore } from './state.js';
import type { ChatSettings } from './types.js';
export declare class SessionManager {
    private api;
    private state;
    private projectRoot;
    private defaults;
    private onCreated?;
    private maxSessionsPerChat;
    constructor(api: DshApi, state: StateStore, projectRoot: string, defaults?: Partial<ChatSettings>, onCreated?: ((chatId: number, sessionId: string) => void) | undefined, maxSessionsPerChat?: number);
    ensureSession(chatId: number, settings: ChatSettings): Promise<string>;
    createSession(chatId: number, settings: ChatSettings): Promise<string>;
    resetSession(chatId: number, settings: ChatSettings): Promise<string>;
}
