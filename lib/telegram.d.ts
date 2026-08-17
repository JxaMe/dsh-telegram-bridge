import type { DshApi, DshContext } from './dsh-types.js';
import { StateStore } from './state.js';
import type { Logger } from './logger.js';
import type { PluginConfig } from './types.js';
export interface TelegramDeps {
    ctx: DshContext;
    api: DshApi;
    config: PluginConfig;
    state: StateStore;
    logger: Logger;
}
export declare function startTelegram(deps: TelegramDeps): Promise<{
    stop: () => Promise<void>;
}>;
