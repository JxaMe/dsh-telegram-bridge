import { Bot, InlineKeyboard, type Context } from 'grammy';
import { createProxiedFetch } from './proxy-fetch.js';
import type { DshApi, DshContext } from './dsh-types.js';
import { EventForwarder } from './forwarder.js';
import { PendingStatus } from './pending-status.js';
import { createRpcId } from './rpc.js';
import { decodeCallback, decodeData, encodeCallback } from './callback.js';
import { friendlyError, redactToken } from './security.js';
import { commandMenuKeyboard, effortsKeyboard, mainMenuKeyboard, modelsPageKeyboard, presetsKeyboard, settingsKeyboard } from './menu.js';
import { escapeHtml } from './forwarder.js';
import { QueueManager } from './queue.js';
import { SessionManager } from './session.js';
import { SettingsManager } from './settings.js';
import { StateStore } from './state.js';
import { getMetrics, incrError, incrMessageReceived } from './metrics.js';
import { checkLatestVersion } from './update-check.js';
import { currentVersion } from './version.js';
import type { Logger } from './logger.js';
import type { PluginConfig } from './types.js';

export interface TelegramDeps {
  ctx: DshContext;
  api: DshApi;
  config: PluginConfig;
  state: StateStore;
  logger: Logger;
}

const HELP_TEXT = (
  '<b>📋 命令帮助</b>\n\n'
  + '<b>/start</b> - 显示主菜单和上手引导\n'
  + '<b>/new</b> - 开始新对话（需要确认）\n'
  + '<b>/interrupt</b> - 打断当前任务并清空队列\n'
  + '<b>/cancel</b> - /interrupt 的别名，同样可用\n'
  + '<b>/status</b> - 查看会话、队列、模型和统计\n'
  + '<b>/menu</b> - 打开设置面板（切换模型/思考强度/Preset）\n'
  + '<b>/compact</b> - 压缩对话历史\n'
  + '<b>/commands</b> - 打开聊天内命令菜单\n'
  + '<b>/version</b> - 查看当前版本与最新版本\n'
  + '<b>/health</b> - 查看运行状态与统计\n'
  + '<b>/help</b> - 显示本帮助\n\n'
  + '💡 <b>提示</b>\n'
  + '• 直接发消息即可与 dsh 对话\n'
  + '• 多条消息会排队，等待提示会显示队列位置\n'
  + '• 如果 Preset 锁定，需要先 /new 再切换\n'
  + '• 处理失败的消息可以点击 🔄 重试'
);

export async function startTelegram(deps: TelegramDeps): Promise<{ stop: () => Promise<void> }> {
  const { ctx: hostCtx, api, config, state, logger } = deps;
  const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';
  const proxyUrl = config.proxyEnabled === false
    ? ''
    : config.proxyEnabled === true
      ? (config.proxyUrl || envProxy)
      : envProxy;
  const debugLog = (message: string) => {
    logger.debug(message);
  };
  const bot = proxyUrl
    ? new Bot(config.botToken, {
        client: {
          fetch: createProxiedFetch(proxyUrl),
        },
      })
    : new Bot(config.botToken);

  bot.catch((err) => {
    logger.error(`middleware error: ${logger.redact(err.error, config.botToken)}`);
  });

  try {
    const me = await bot.api.getMe();
    debugLog(`Telegram bot connected as @${me.username ?? 'unknown'}`);
  } catch (error) {
    logger.error(`Telegram getMe failed: ${logger.redact(error, config.botToken)}`);
    throw error;
  }

  void (async () => {
    try {
      const selfCheck = await api.agentPresets.list({ rpcId: createRpcId(), payload: {} });
      if (!selfCheck.result.ok) {
        logger.warn(`dsh API self-check agentPresets.list: ${JSON.stringify(selfCheck.result.error)}`);
      }
    } catch (error) {
      logger.warn(`dsh API self-check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();

  const typingEnabled = config.typingIndicator !== false;
  const pending = new PendingStatus();
  const settings = new SettingsManager(api, state);
  const sessions = new SessionManager(
    api,
    state,
    config.projectRoot ?? process.cwd(),
    {
      provider: config.defaultProvider || undefined,
      model: config.defaultModel || undefined,
      reasoningEffort: config.defaultReasoningEffort || undefined,
      agentPreset: config.defaultAgentPreset || undefined,
    },
    async (chatId, sessionId) => {
      try {
        debugLog(`session created ${sessionId} for chat ${chatId}`);
        const chatSettings = state.getChatSettings(chatId);
        const presetName = chatSettings.agentPresetName ?? chatSettings.agentPreset ?? '默认';
        await bot.api.sendMessage(
          chatId,
          `🆕 新会话已创建\n模型：${chatSettings.model ?? '默认'}\nPreset：${presetName}`,
        );
      } catch {
        // Notification failure should not break session creation.
      }
    },
  );
  const errorText = (error: unknown) =>
    config.errorDisplayMode === 'friendly'
      ? friendlyError(error)
      : error instanceof Error ? error.message : String(error);
  const queue = new QueueManager(
    api,
    sessions,
    state,
    async (chatId, error, failureId) => {
      try {
        await pending.showErrorThenClear(bot, chatId);
        stopTyping(chatId);
        incrError();
        const failed = queue.getFailedItem(chatId, failureId);
        const keyboard = failed ? new InlineKeyboard().text('🔄 重试', encodeCallback(['retry', failureId])) : undefined;
        await bot.api.sendMessage(chatId, `处理失败：${errorText(error)}`, {
          reply_markup: keyboard,
        });
      } catch {
        // ignore report failures
      }
    },
    config.queueLimit ?? 20,
    config.dataDir ?? process.env.DSH_TELEGRAM_DATA_DIR,
  );
  const forwarder = new EventForwarder(hostCtx, bot, state, pending, queue, (chatId) => stopTyping(chatId), config.htmlFormatting !== false, config.statusLine !== false);
  forwarder.start();

  // Owner-only middleware
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined || chatId !== config.ownerId) return;
    await next();
  });

  bot.command('start', async (ctx) => {
    await ctx.reply(
      'dsh-telegram-bridge 已启动 🚀\n\n' +
      '直接发送消息即可与 dsh 对话。\n' +
      '/menu - 切换模型、思考强度、Preset\n' +
      '/commands - 打开命令菜单\n' +
      '/interrupt - 打断当前任务\n' +
      '/status - 查看状态统计',
      { reply_markup: mainMenuKeyboard() },
    );
  });

  bot.command('help', async (ctx) => {
    await sendCommandMenu(bot, ctx.chat!.id, true);
    await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
  });

  bot.command('version', async (ctx) => {
    const current = currentVersion();
    const info = await checkLatestVersion(proxyUrl);
    const text = info.hasUpdate
      ? `当前版本：v${current}\n最新版本：v${info.latest}\n\n📢 有新版本可用，请更新插件。\n${info.url ?? 'https://github.com/JxaMe/dsh-telegram-bridge/releases'}`
      : `当前版本：v${current}（已是最新）`;
    await ctx.reply(text);
  });

  bot.command('commands', async (ctx) => {
    await sendCommandMenu(bot, ctx.chat!.id, true);
  });

  bot.command('new', async (ctx) => {
    await ctx.reply('确定要开始新对话吗？', {
      reply_markup: new InlineKeyboard()
        .text('确认', 'confirm_new')
        .text('取消', 'cancel_new'),
    });
  });

  bot.command('confirm_new', async (ctx) => {
    const chatId = ctx.chat!.id;
    await cancelCurrent(chatId, hostCtx, state, queue);
    await pending.clear(bot, chatId);
    const chatSettings = state.getChatSettings(chatId);
    await sessions.resetSession(chatId, chatSettings);
    await ctx.reply('已开始新对话。');
  });

  bot.command('cancel', async (ctx) => {
    const chatId = ctx.chat!.id;
    await cancelCurrent(chatId, hostCtx, state, queue);
    await pending.clear(bot, chatId);
    stopTyping(chatId);
    await ctx.reply('已打断当前任务并清空队列。');
  });

  bot.command('interrupt', async (ctx) => {
    const chatId = ctx.chat!.id;
    await cancelCurrent(chatId, hostCtx, state, queue);
    await pending.clear(bot, chatId);
    stopTyping(chatId);
    await ctx.reply('已打断当前任务并清空队列。');
  });

  bot.command('status', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = state.getChatState(chatId);
    if (!chat?.sessionId) {
      await ctx.reply('还没有会话，直接发消息即可开始对话。');
      return;
    }
    const text = await statusText(chatId, hostCtx, state, queue);
    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.command('menu', async (ctx) => {
    const panel = await settingsPanel(state, settings, ctx.chat!.id);
    await ctx.reply(panel.text, { reply_markup: panel.keyboard });
  });

  bot.command('sessions', async (ctx) => {
    const chatId = ctx.chat!.id;
    const panel = await sessionsPanel(state, chatId);
    await ctx.reply(panel.text, { reply_markup: panel.keyboard });
  });

  bot.command('health', async (ctx) => {
    const m = getMetrics();
    await ctx.reply(
      '✅ dsh-telegram-bridge 运行正常\n'
      + `运行时长：${formatUptime(m.uptimeSeconds)}\n`
      + `收到消息：${m.messagesReceived}\n`
      + `发送回复：${m.repliesSent}\n`
      + `错误次数：${m.errors}`,
    );
  });

  bot.command('compact', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = state.getChatState(chatId);
    if (!chat?.sessionId) {
      await ctx.reply('还没有会话，无法压缩。');
      return;
    }
    await ctx.reply('确定要压缩当前对话历史吗？', {
      reply_markup: new InlineKeyboard()
        .text('确认压缩', 'confirm_compact')
        .text('取消', 'cancel_compact'),
    });
  });

  bot.callbackQuery('confirm_compact', async (ctx) => {
    const chatId = ctx.chat!.id;
    const result = await runCompact(chatId, hostCtx, api, state);
    await ctx.answerCallbackQuery('压缩已处理');
    await ctx.editMessageText(result);
  });

  bot.callbackQuery('cancel_compact', async (ctx) => {
    await ctx.editMessageText('已取消。');
    await ctx.answerCallbackQuery();
  });

  // Inline callbacks
  bot.callbackQuery('new', async (ctx) => {
    await ctx.reply('确定要开始新对话吗？', {
      reply_markup: new InlineKeyboard()
        .text('确认', 'confirm_new')
        .text('取消', 'cancel_new'),
    });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('confirm_new', async (ctx) => {
    const chatId = ctx.chat!.id;
    await cancelCurrent(chatId, hostCtx, state, queue);
    await pending.clear(bot, chatId);
    const chatSettings = state.getChatSettings(chatId);
    await sessions.resetSession(chatId, chatSettings);
    await ctx.editMessageText('已开始新对话。');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('cancel_new', async (ctx) => {
    await ctx.editMessageText('已取消。');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('cancel', async (ctx) => {
    const chatId = ctx.chat!.id;
    await cancelCurrent(chatId, hostCtx, state, queue);
    await pending.clear(bot, chatId);
    stopTyping(chatId);
    await ctx.reply('已打断当前任务并清空队列。');
    await ctx.answerCallbackQuery('已打断');
  });

  bot.callbackQuery('status', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = state.getChatState(chatId);
    if (!chat?.sessionId) {
      await ctx.reply('还没有会话，直接发消息即可开始对话。');
      await ctx.answerCallbackQuery();
      return;
    }
    const text = await statusText(chatId, hostCtx, state, queue);
    await ctx.reply(text, { parse_mode: 'HTML' });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu', async (ctx) => {
    const panel = await settingsPanel(state, settings, ctx.chat!.id);
    await ctx.editMessageText(panel.text, { reply_markup: panel.keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('sessions', async (ctx) => {
    const chatId = ctx.chat!.id;
    const panel = await sessionsPanel(state, chatId);
    await ctx.editMessageText(panel.text, { reply_markup: panel.keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^session:/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const parts = decodeCallback(ctx.callbackQuery.data);
    if (!parts || parts[0] !== 'session' || !parts[1]) {
      await ctx.answerCallbackQuery('无效的会话数据');
      return;
    }
    state.setActiveSession(chatId, parts[1]);
    await ctx.answerCallbackQuery('已切换会话');
    await ctx.editMessageText('已切换会话。');
  });

  bot.callbackQuery('back', async (ctx) => {
    await ctx.editMessageText('快捷操作', { reply_markup: mainMenuKeyboard() });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^retry:/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const parts = decodeCallback(ctx.callbackQuery.data);
    if (!parts || parts[0] !== 'retry' || !parts[1]) {
      await ctx.answerCallbackQuery('无效的重试数据');
      return;
    }
    const failureId = parts[1];
    const failed = queue.getFailedItem(chatId, failureId);
    if (!failed) {
      await ctx.answerCallbackQuery('没有可重试的失败消息');
      return;
    }
    queue.clearFailedItem(chatId, failureId);
    debugLog(`retrying failed message for chat ${chatId}`);
    const accepted = queue.enqueue(chatId, failed.text);
    if (!accepted) {
      await ctx.answerCallbackQuery('队列已满，无法重试');
      return;
    }
    await ctx.answerCallbackQuery('已重试');
    if (!pending.has(chatId)) {
      const sent = await bot.api.sendMessage(chatId, '🐋 正在思考...');
      pending.set(bot, chatId, sent.message_id, queue.queueLength(chatId));
      startTyping(bot, chatId, typingEnabled);
    }
  });

  bot.callbackQuery('command_menu', async (ctx) => {
    await ctx.editMessageText('📋 命令菜单', { reply_markup: commandMenuKeyboard() });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^cmd_/, async (ctx) => {
    const command = ctx.callbackQuery.data;
    const chatId = ctx.chat!.id;
    try {
      if (command === 'cmd_new') {
        await ctx.reply('确定要开始新对话吗？', {
          reply_markup: new InlineKeyboard()
            .text('确认', 'confirm_new')
            .text('取消', 'cancel_new'),
        });
        await ctx.answerCallbackQuery();
        return;
      }
      if (command === 'cmd_cancel' || command === 'cmd_interrupt') {
        await cancelCurrent(chatId, hostCtx, state, queue);
        await pending.clear(bot, chatId);
        stopTyping(chatId);
        await ctx.reply('已打断当前任务并清空队列。');
        await ctx.answerCallbackQuery();
        return;
      }
      if (command === 'cmd_status') {
        const chat = state.getChatState(chatId);
        if (!chat?.sessionId) {
          await ctx.reply('还没有会话，直接发消息即可开始对话。');
          await ctx.answerCallbackQuery();
          return;
        }
        await ctx.reply(await statusText(chatId, hostCtx, state, queue), { parse_mode: 'HTML' });
        await ctx.answerCallbackQuery();
        return;
      }
      if (command === 'cmd_menu') {
        const panel = await settingsPanel(state, settings, chatId);
        await ctx.reply(panel.text, { reply_markup: panel.keyboard });
        await ctx.answerCallbackQuery();
        return;
      }
      if (command === 'cmd_sessions') {
        const panel = await sessionsPanel(state, chatId);
        await ctx.reply(panel.text, { reply_markup: panel.keyboard });
        await ctx.answerCallbackQuery();
        return;
      }
      if (command === 'cmd_compact') {
        const result = await runCompact(chatId, hostCtx, api, state);
        await bot.api.sendMessage(chatId, result);
        await ctx.answerCallbackQuery('压缩已处理');
        return;
      }
      if (command === 'cmd_help') {
        await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
        await ctx.answerCallbackQuery();
        return;
      }
      await ctx.answerCallbackQuery('未知命令');
    } catch (error) {
      await ctx.answerCallbackQuery('操作失败');
      await ctx.reply(`操作失败：${error instanceof Error ? error.message : String(error)}`);
    }
  });

  bot.callbackQuery('models', async (ctx) => {
    await showModelsPage(ctx, 0, sessions, settings, state);
  });

  bot.callbackQuery(/^models_page\|/, async (ctx) => {
    const parts = decodeData(ctx.callbackQuery.data);
    const page = Number(parts[1] ?? '0');
    if (!Number.isFinite(page) || page < 0) {
      await ctx.answerCallbackQuery('无效的页码');
      return;
    }
    await showModelsPage(ctx, page, sessions, settings, state);
  });

  bot.callbackQuery(/^model:/, async (ctx) => {
    const parts = decodeCallback(ctx.callbackQuery.data);
    if (!parts || parts.length < 3) {
      await ctx.answerCallbackQuery('无效的模型数据');
      return;
    }
    const [, provider, model] = parts;
    const chatId = ctx.chat!.id;
    try {
      const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
      await settings.selectModel(chatId, sessionId, provider, model);
      await ctx.answerCallbackQuery('已切换模型');
      const panel = await settingsPanel(state, settings, chatId);
      await ctx.editMessageText(panel.text, { reply_markup: panel.keyboard });
    } catch (error) {
      await ctx.answerCallbackQuery('切换失败');
      await ctx.editMessageText(`切换失败：${friendlyError(error, '模型')}`);
    }
  });

  bot.callbackQuery('efforts', async (ctx) => {
    const chatId = ctx.chat!.id;
    try {
      const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
      const models = await settings.getModels(sessionId);
      const current = state.getChatSettings(chatId);
      const provider = current.provider ?? models.current.provider ?? models.groups[0]?.id;
      const model = current.model ?? models.current.model ?? models.groups[0]?.models[0]?.id;
      const group = models.groups.find((g) => g.id === provider);
      const entry = group?.models.find((m) => m.id === model);
      const efforts = entry?.reasoning?.efforts ?? [];
      if (!provider || !model || efforts.length === 0) {
        await ctx.editMessageText('当前模型没有可用的思考强度选项。');
        await ctx.answerCallbackQuery();
        return;
      }
      const page = effortsKeyboard(provider, model, efforts, current.reasoningEffort);
      await ctx.editMessageText(page.text, { reply_markup: page.keyboard });
    } catch (error) {
      await ctx.editMessageText(`读取失败：${friendlyError(error, '思考强度')}`);
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^effort:/, async (ctx) => {
    const parts = decodeCallback(ctx.callbackQuery.data);
    if (!parts || parts.length < 4) {
      await ctx.answerCallbackQuery('无效的思考强度数据');
      return;
    }
    const [, provider, model, effort] = parts;
    const chatId = ctx.chat!.id;
    try {
      const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
      await settings.selectModel(chatId, sessionId, provider, model, effort);
      await ctx.answerCallbackQuery('已切换思考强度');
      const panel = await settingsPanel(state, settings, chatId);
      await ctx.editMessageText(panel.text, { reply_markup: panel.keyboard });
    } catch (error) {
      await ctx.answerCallbackQuery('切换失败');
      await ctx.editMessageText(`切换失败：${friendlyError(error, '思考强度')}`);
    }
  });

  bot.callbackQuery('presets', async (ctx) => {
    const chatId = ctx.chat!.id;
    try {
      const presets = await settings.listPresets();
      const currentPreset = state.getChatSettings(chatId).agentPreset;
      const page = presetsKeyboard(presets, currentPreset);
      await ctx.editMessageText(page.text, { reply_markup: page.keyboard });
    } catch (error) {
      await ctx.editMessageText(`读取失败：${friendlyError(error, 'Preset')}`);
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^preset:/, async (ctx) => {
    const parts = decodeCallback(ctx.callbackQuery.data);
    if (!parts || parts.length < 2) {
      await ctx.answerCallbackQuery('无效的 preset 数据');
      return;
    }
    const [, preset] = parts;
    const chatId = ctx.chat!.id;
    try {
      const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
      await settings.selectPreset(chatId, sessionId, preset);
      await ctx.answerCallbackQuery('已切换 preset');
      const panel = await settingsPanel(state, settings, chatId);
      await ctx.editMessageText(panel.text, { reply_markup: panel.keyboard });
    } catch (error) {
      await ctx.answerCallbackQuery('切换失败');
      await ctx.editMessageText(`切换失败：${friendlyError(error, 'Preset')}`);
    }
  });

  bot.callbackQuery('regenerate', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = state.getChatState(chatId);
    if (!chat?.lastUserMessage) {
      await ctx.answerCallbackQuery('没有可重新生成的消息');
      return;
    }
    const accepted = queue.enqueue(chatId, chat.lastUserMessage);
    if (!accepted) {
      await ctx.answerCallbackQuery('队列已满，无法重新生成');
      return;
    }
    await ctx.answerCallbackQuery('已重新生成');
    debugLog(`regenerating last message for chat ${chatId}`);
    if (!pending.has(chatId)) {
      const sent = await bot.api.sendMessage(chatId, '🐋 正在思考...');
      pending.set(bot, chatId, sent.message_id);
      startTyping(bot, chatId, typingEnabled);
    }
  });

  // Plain text messages
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    incrMessageReceived();
    state.incrementUserMessage(ctx.chat.id);
    const chatState = state.getChatState(ctx.chat.id);
    if (chatState) {
      state.setChatState(ctx.chat.id, { ...chatState, lastActiveAt: Date.now(), lastUserMessage: text });
      state.ensureSessionTitle(ctx.chat.id, chatState.sessionId, text.slice(0, 40));
    }
    const accepted = queue.enqueue(ctx.chat.id, text);
    if (!accepted) {
      await ctx.reply('队列已满，请等待当前任务完成后再发送。');
      return;
    }
    debugLog(`message queued for chat ${ctx.chat.id}`);
    if (!pending.has(ctx.chat.id)) {
      const sent = await ctx.reply('🐋 正在思考...');
      pending.set(bot, ctx.chat.id, sent.message_id);
      startTyping(bot, ctx.chat.id, typingEnabled);
    }
    await ctx.replyWithChatAction('typing');
  });

  await bot.init();
  void (async () => {
    try {
      const info = await checkLatestVersion(proxyUrl);
      if (info.hasUpdate) {
        await bot.api.sendMessage(
          config.ownerId,
          `📢 dsh-telegram-bridge 有新版本 v${info.latest}（当前 v${currentVersion()}）\n更新：${info.url ?? 'https://github.com/JxaMe/dsh-telegram-bridge/releases'}`,
        );
      }
    } catch {
      // Update notification is best-effort.
    }
  })();
  await setupCommandMenu(bot, config.ownerId, config.botToken, logger);
  void bot.start({
    onStart: () => debugLog('Telegram bot started'),
  }).catch((error) => {
    logger.error(`Telegram bot stopped with error: ${logger.redact(error, config.botToken)}`);
  });

  return {
    stop: async () => {
      pending.dispose();
      stopAllTyping();
      await bot.stop();
    },
  };
}

async function showModelsPage(
  ctx: Context,
  page: number,
  sessions: SessionManager,
  settings: SettingsManager,
  state: StateStore,
): Promise<void> {
  const chatId = ctx.chat!.id;
  try {
    const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
    const models = await settings.getModels(sessionId);
    const current = state.getChatSettings(chatId);
    const pageData = modelsPageKeyboard(models, current, page);
    await ctx.editMessageText(pageData.text, { reply_markup: pageData.keyboard });
  } catch (error) {
    await ctx.editMessageText(`读取失败：${friendlyError(error, '模型')}`);
  }
  await ctx.answerCallbackQuery();
}

async function settingsPanel(
  state: StateStore,
  settings: SettingsManager,
  chatId: number,
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const chatSettings = state.getChatSettings(chatId);
  const display = { ...chatSettings };
  if (chatSettings.agentPreset) {
    try {
      const presets = await settings.listPresets();
      const preset = presets.find((entry) => entry.id === chatSettings.agentPreset);
      if (preset?.name) {
        display.agentPresetName = preset.name;
      }
    } catch {
      // Keep the stored id/name; settings panel should still open.
    }
  }
  return { text: '设置面板', keyboard: settingsKeyboard(display) };
}

async function sessionsPanel(
  state: StateStore,
  chatId: number,
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const active = state.getChatState(chatId);
  const sessions = state.listChatSessions(chatId).slice().reverse();
  if (sessions.length === 0) {
    return { text: '还没有会话。', keyboard: new InlineKeyboard().text('🆕 新对话', 'new') };
  }
  const lines = sessions.map((session, index) => {
    const settings = state.getSessionSettings(session.sessionId);
    const title = session.title || `会话 ${new Date(session.createdAt).toLocaleString()}`;
    const activeMark = session.sessionId === active?.sessionId ? ' 📌' : '';
    const model = settings.model ?? '默认';
    const preset = settings.agentPresetName ?? settings.agentPreset ?? '默认';
    return `${index + 1}. ${title}${activeMark}\n    ${model} / ${preset}`;
  });
  const keyboard = new InlineKeyboard();
  for (const session of sessions) {
    const title = session.title || '会话';
    const label = session.sessionId === active?.sessionId ? `📌 ${title}` : title;
    keyboard.text(label, encodeCallback(['session', session.sessionId])).row();
  }
  keyboard.append(new InlineKeyboard().text('🆕 新对话', 'new').text('返回', 'back'));
  return { text: `📂 最近会话\n\n${lines.join('\n\n')}`, keyboard };
}

async function sendCommandMenu(bot: Bot, chatId: number, pin = false): Promise<void> {
  const sent = await bot.api.sendMessage(chatId, '📋 命令菜单', { reply_markup: commandMenuKeyboard() });
  if (pin) {
    try {
      await bot.api.pinChatMessage(chatId, sent.message_id);
    } catch {
      // Private chats may not allow bots to pin messages; the menu is still sent.
    }
  }
}

const typingTimers = new Map<number, ReturnType<typeof setInterval>>();

function startTyping(bot: Bot, chatId: number, enabled = true): void {
  if (!enabled) return;
  const existing = typingTimers.get(chatId);
  if (existing) return;
  const interval = setInterval(async () => {
    try {
      await bot.api.sendChatAction(chatId, 'typing');
    } catch {
      // ignore
    }
  }, 5000);
  typingTimers.set(chatId, interval);
}

function stopTyping(chatId: number): void {
  const timer = typingTimers.get(chatId);
  if (timer) {
    clearInterval(timer);
    typingTimers.delete(chatId);
  }
}

function stopAllTyping(): void {
  for (const timer of typingTimers.values()) {
    clearInterval(timer);
  }
  typingTimers.clear();
}

async function cancelCurrent(
  chatId: number,
  ctx: DshContext,
  state: StateStore,
  queue: QueueManager,
): Promise<void> {
  queue.clear(chatId);
  stopTyping(chatId);
  const chat = state.getChatState(chatId);
  if (!chat) return;
  const agent = ctx.agents.get(chat.sessionId);
  if (agent) {
    agent.cancel({ kind: 'user' });
  }
}

async function statusText(
  chatId: number,
  ctx: DshContext,
  state: StateStore,
  queue: QueueManager,
): Promise<string> {
  const chat = state.getChatState(chatId);
  const settings = state.getChatSettings(chatId);
  const agent = chat?.sessionId ? ctx.agents.get(chat.sessionId) : undefined;
  const stats = state.getChatStats(chatId);
  const busy = queue.isProcessing(chatId) || agent?.status === 'running';
  const provider = settings.provider ?? agent?.options?.provider ?? '默认';
  const model = settings.model ?? agent?.options?.model ?? '默认';
  const historyEvents = agent?.session?.events;
  const hasHistory = Array.isArray(historyEvents) ? historyEvents.length > 0 : undefined;
  const lockText = hasHistory === undefined
    ? settings.agentPreset ? '未知' : '无会话'
    : hasHistory ? '已锁定' : '未锁定';

  const sessionId = chat?.sessionId ?? '无';
  const presetName = settings.agentPresetName ?? settings.agentPreset ?? '默认';
  const cacheStr = stats.cacheReadTokens || stats.cacheWriteTokens
    ? `，缓存 ${stats.cacheReadTokens ?? 0}/${stats.cacheWriteTokens ?? 0}`
    : '';
  const idleMs = 5 * 60 * 1000;
  const recentActive = chat?.lastActiveAt !== undefined && Date.now() - chat.lastActiveAt < idleMs;
  const lifecycle = busy ? '处理中' : recentActive ? '活跃' : '空闲';

  return (
    `<b>状态：</b>${lifecycle}\n`
    + `<b>忙碌：</b>${busy ? '是' : '否'}\n`
    + `<b>会话：</b><code>${escapeHtml(sessionId)}</code>\n`
    + `<b>队列：</b>${queue.queueLength(chatId)}\n`
    + `<b>提供方：</b>${escapeHtml(provider)}\n`
    + `<b>模型：</b>${escapeHtml(model)}\n`
    + `<b>思考强度：</b>${escapeHtml(settings.reasoningEffort ?? '默认')}\n`
    + `<b>Preset：</b>${escapeHtml(presetName)}（${lockText}）\n`
    + `<b>消息：</b>用户 ${stats.userMessages} / 助手 ${stats.assistantMessages}\n`
    + `<b>Token：</b>入 ${stats.inputTokens} / 出 ${stats.outputTokens}${cacheStr}\n`
    + `<b>运行：</b>${formatUptime(getMetrics().uptimeSeconds)} · 错误 ${getMetrics().errors}`
  );
}

async function runCompact(
  chatId: number,
  ctx: DshContext,
  api: DshApi,
  state: StateStore,
): Promise<string> {
  const chat = state.getChatState(chatId);
  if (!chat) {
    return '当前没有会话。';
  }
  const compaction = ctx.get<{ compactNow(agent: unknown, signal: AbortSignal): Promise<unknown> }>('compaction');
  const agent = ctx.agents.get(chat.sessionId);
  if (compaction && agent) {
    try {
      await compaction.compactNow(agent, new AbortController().signal);
      return '压缩完成。';
    } catch (error) {
      return `压缩失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  const res = await api.sessions.prompt({
    rpcId: createRpcId(),
    payload: {
      sessionId: chat.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: '/compact' }],
    },
  });
  if (!res.result.ok) {
    return `压缩失败：${JSON.stringify(res.result.error)}`;
  }
  return '已请求压缩。';
}

async function setupCommandMenu(bot: Bot, ownerId: number, botToken: string, logger: Logger): Promise<void> {
  const commands = [
    { command: 'start', description: '显示主菜单和上手引导' },
    { command: 'new', description: '开始新对话' },
    { command: 'interrupt', description: '打断当前任务并清空队列' },
    { command: 'status', description: '查看状态与统计' },
    { command: 'menu', description: '打开设置面板' },
    { command: 'sessions', description: '查看和切换最近会话' },
    { command: 'compact', description: '压缩上下文' },
    { command: 'commands', description: '打开聊天内命令菜单' },
    { command: 'version', description: '查看版本与更新' },
    { command: 'health', description: '查看运行状态与统计' },
    { command: 'help', description: '查看命令帮助' },
  ];
  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await bot.api.setMyCommands(commands, { scope: { type: 'all_private_chats' } });
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }
    if (lastError) throw lastError;
    await bot.api.setChatMenuButton({
      chat_id: ownerId,
      menu_button: { type: 'commands' },
    });
    await bot.api.setChatMenuButton({
      menu_button: { type: 'commands' },
    });
  } catch (error) {
    logger.error(`Failed to setup command menu: ${logger.redact(error, botToken)}`);
  }
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}小时 ${m}分 ${s}秒`;
  if (m > 0) return `${m}分 ${s}秒`;
  return `${s}秒`;
}
