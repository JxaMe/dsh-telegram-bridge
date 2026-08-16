import { defaultDataDir, ensureDataDir, loadConfig, writeExampleConfig } from './config.js';
import { StateStore } from './state.js';
import { startTelegram } from './telegram.js';
export const name = 'dsh-telegram-bridge';
export const inject = ['apiProxy', 'agents'];
export function apply(ctx) {
    const dataDir = process.env.DSH_TELEGRAM_DATA_DIR ?? defaultDataDir();
    ensureDataDir(dataDir);
    writeExampleConfig(dataDir);
    let config;
    try {
        config = loadConfig(dataDir);
    }
    catch (error) {
        ctx.logger.warn(`dsh-telegram-bridge 启动配置错误: ${error instanceof Error ? error.message : String(error)}。请检查 ${dataDir}/config.json 中的 botToken 和 ownerId。`);
        return;
    }
    const state = new StateStore(config.dataDir ?? dataDir);
    let stopFn;
    let disposed = false;
    void startTelegram({ ctx, api: ctx.apiProxy, config, state })
        .then((handle) => {
        if (disposed) {
            void handle.stop();
        }
        else {
            stopFn = handle.stop;
        }
    })
        .catch((error) => {
        ctx.logger.warn(`dsh-telegram-bridge 启动失败: ${error instanceof Error ? error.message : String(error)}。请确认 botToken 有效、ownerId 正确，并检查 Telegram API 网络/代理。`);
    });
    ctx.effect(() => {
        return () => {
            disposed = true;
            if (stopFn) {
                void stopFn();
            }
        };
    });
}
