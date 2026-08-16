import type { DshApi } from './dsh-types.js';
import type { StateStore } from './state.js';
import type { ChatSettings } from './types.js';
export declare class SessionManager {
    private api;
    private state;
    private projectRoot;
    constructor(api: DshApi, state: StateStore, projectRoot: string);
    ensureSession(chatId: number, settings: ChatSettings): Promise<string>;
    createSession(chatId: number, settings: ChatSettings): Promise<string>;
    resetSession(chatId: number, settings: ChatSettings): Promise<string>;
}
