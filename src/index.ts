import { defaultDataDir, ensureDataDir, loadConfig, writeExampleConfig } from './config.js';
import type { DshContext } from './dsh-types.js';
import { Logger } from './logger.js';
import { StateStore } from './state.js';
import { startTelegram } from './telegram.js';
import { registerWebSettings } from './web-settings.js';
import type { PluginConfig } from './types.js';

export const name = 'dsh-telegram-bridge';
export const inject = ['apiProxy', 'agents', 'webServer'];

let globalHandlersInstalled = false;

export function apply(ctx: DshContext): void {
  const dataDir = process.env.DSH_TELEGRAM_DATA_DIR ?? defaultDataDir();
  ensureDataDir(dataDir);
  writeExampleConfig(dataDir);

  const logger = new Logger(dataDir);
  installGlobalHandlers(logger);
  const state = new StateStore(dataDir);
  registerWebSettings(ctx, dataDir);

  let config: PluginConfig;
  try {
    config = loadConfig(dataDir);
  } catch (error) {
    ctx.logger.warn(
      `dsh-telegram-bridge 启动配置错误: ${error instanceof Error ? error.message : String(error)}。请检查 ${dataDir}/config.json 中的 botToken 和 ownerId。`,
    );
    return;
  }

  logger.setDebugEnabled(config.debugLogging === true);

  let stopFn: (() => Promise<void>) | undefined;
  let disposed = false;

  void startTelegram({ ctx, api: ctx.apiProxy, config, state, logger })
    .then((handle) => {
      if (disposed) {
        void handle.stop();
      } else {
        stopFn = handle.stop;
      }
    })
    .catch((error) => {
      logger.error(
        `startup failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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

function installGlobalHandlers(logger: Logger): void {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;
  process.on('unhandledRejection', (reason) => {
    logger.error(`unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
  });
  process.on('uncaughtException', (error) => {
    logger.error(`uncaught exception: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  });
}
