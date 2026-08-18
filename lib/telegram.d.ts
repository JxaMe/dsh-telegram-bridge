import { Bot } from 'grammy';
import type { DshApi, DshContext } from './dsh-types.js';
import { PendingStatus } from './pending-status.js';
import { QueueManager } from './queue.js';
import { SessionManager } from './session.js';
import { SettingsManager } from './settings.js';
import { StateStore } from './state.js';
import { checkLatestVersion } from './update-check.js';
import type { Logger } from './logger.js';
import type { PluginConfig } from './types.js';
export interface TelegramDeps {
    ctx: DshContext;
    api: DshApi;
    config: PluginConfig;
    state: StateStore;
    logger: Logger;
}
export interface TelegramRuntime {
    hostCtx: DshContext;
    api: DshApi;
    config: PluginConfig;
    state: StateStore;
    pending: PendingStatus;
    settings: SettingsManager;
    sessions: SessionManager;
    queue: QueueManager;
    typingEnabled: boolean;
    proxyUrl: string;
    debugLog: (message: string) => void;
    checkLatestVersion?: typeof checkLatestVersion;
}
export declare function registerTelegramHandlers(bot: Bot, runtime: TelegramRuntime): void;
export declare function startTelegram(deps: TelegramDeps): Promise<{
    stop: () => Promise<void>;
}>;
