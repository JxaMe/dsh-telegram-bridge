import type { Bot } from 'grammy';
import type { DshContext } from './dsh-types.js';
import type { PendingStatus } from './pending-status.js';
import type { StateStore } from './state.js';
export declare class EventForwarder {
    private ctx;
    private bot;
    private state;
    private pending;
    constructor(ctx: DshContext, bot: Bot, state: StateStore, pending: PendingStatus);
    start(): void;
    private findChatId;
    private sendToTelegram;
}
