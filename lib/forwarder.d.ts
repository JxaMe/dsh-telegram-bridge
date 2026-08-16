import type { Bot } from 'grammy';
import type { DshContext } from './dsh-types.js';
import type { StateStore } from './state.js';
export declare class EventForwarder {
    private ctx;
    private bot;
    private state;
    constructor(ctx: DshContext, bot: Bot, state: StateStore);
    start(): void;
    private findChatId;
    private sendToTelegram;
}
