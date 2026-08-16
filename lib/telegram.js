import { Bot, InlineKeyboard } from 'grammy';
import { createProxiedFetch } from './proxy-fetch.js';
import { EventForwarder } from './forwarder.js';
import { PendingStatus } from './pending-status.js';
import { createRpcId } from './rpc.js';
import { decodeData } from './callback.js';
import { redactToken } from './security.js';
import { commandMenuKeyboard, effortsKeyboard, mainMenuKeyboard, modelsPageKeyboard, presetsKeyboard, settingsKeyboard } from './menu.js';
import { QueueManager } from './queue.js';
import { SessionManager } from './session.js';
import { SettingsManager } from './settings.js';
export async function startTelegram(deps) {
    const { ctx: hostCtx, api, config, state } = deps;
    const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || '';
    const bot = proxyUrl
        ? new Bot(config.botToken, {
            client: {
                fetch: createProxiedFetch(proxyUrl),
            },
        })
        : new Bot(config.botToken);
    bot.catch((err) => {
        console.error('dsh-telegram-bridge middleware error:', redactToken(err.error, config.botToken));
    });
    const pending = new PendingStatus();
    const sessions = new SessionManager(api, state, config.projectRoot ?? process.cwd());
    const settings = new SettingsManager(api, state);
    const queue = new QueueManager(api, sessions, state, async (chatId, error) => {
        try {
            await pending.clear(bot, chatId);
            await bot.api.sendMessage(chatId, `处理失败：${error instanceof Error ? error.message : String(error)}`);
        }
        catch {
            // ignore report failures
        }
    });
    const forwarder = new EventForwarder(hostCtx, bot, state, pending, queue);
    forwarder.start();
    // Owner-only middleware
    bot.use(async (ctx, next) => {
        const chatId = ctx.chat?.id;
        if (chatId === undefined || chatId !== config.ownerId)
            return;
        await next();
    });
    bot.command('start', async (ctx) => {
        await ctx.reply('dsh-telegram-bridge 已启动', { reply_markup: mainMenuKeyboard() });
    });
    bot.command('help', async (ctx) => {
        await ctx.reply('📋 命令菜单（也可以直接输入 /commands）', { reply_markup: commandMenuKeyboard() });
    });
    bot.command('commands', async (ctx) => {
        await ctx.reply('📋 命令菜单', { reply_markup: commandMenuKeyboard() });
    });
    bot.command('new', async (ctx) => {
        await ctx.reply('确定要开始新对话吗？', {
            reply_markup: new InlineKeyboard()
                .text('确认', 'confirm_new')
                .text('取消', 'cancel_new'),
        });
    });
    bot.command('confirm_new', async (ctx) => {
        const chatId = ctx.chat.id;
        const chatSettings = state.getChatSettings(chatId);
        await sessions.resetSession(chatId, chatSettings);
        await ctx.reply('已开始新对话。');
    });
    bot.command('cancel', async (ctx) => {
        const chatId = ctx.chat.id;
        await cancelCurrent(chatId, hostCtx, state, queue);
        await pending.clear(bot, chatId);
        await ctx.reply('已取消当前任务并清空队列。');
    });
    bot.command('status', async (ctx) => {
        const chatId = ctx.chat.id;
        const text = await statusText(chatId, hostCtx, state, queue);
        await ctx.reply(text);
    });
    bot.command('menu', async (ctx) => {
        await ctx.reply('设置面板', { reply_markup: settingsKeyboard() });
    });
    bot.command('compact', async (ctx) => {
        const chatId = ctx.chat.id;
        await runCompact(chatId, hostCtx, api, state, async (id, text) => {
            await bot.api.sendMessage(id, text);
        });
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
        const chatId = ctx.chat.id;
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
        const chatId = ctx.chat.id;
        await cancelCurrent(chatId, hostCtx, state, queue);
        await pending.clear(bot, chatId);
        await ctx.answerCallbackQuery('已取消当前任务并清空队列');
    });
    bot.callbackQuery('status', async (ctx) => {
        const chatId = ctx.chat.id;
        const text = await statusText(chatId, hostCtx, state, queue);
        await ctx.reply(text);
        await ctx.answerCallbackQuery();
    });
    bot.callbackQuery('menu', async (ctx) => {
        await ctx.editMessageText('设置面板', { reply_markup: settingsKeyboard() });
        await ctx.answerCallbackQuery();
    });
    bot.callbackQuery('back', async (ctx) => {
        await ctx.editMessageText('快捷操作', { reply_markup: mainMenuKeyboard() });
        await ctx.answerCallbackQuery();
    });
    bot.callbackQuery('command_menu', async (ctx) => {
        await ctx.editMessageText('📋 命令菜单', { reply_markup: commandMenuKeyboard() });
        await ctx.answerCallbackQuery();
    });
    bot.callbackQuery(/^cmd_/, async (ctx) => {
        const command = ctx.callbackQuery.data;
        const chatId = ctx.chat.id;
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
            if (command === 'cmd_cancel') {
                await cancelCurrent(chatId, hostCtx, state, queue);
                await pending.clear(bot, chatId);
                await ctx.reply('已取消当前任务并清空队列。');
                await ctx.answerCallbackQuery();
                return;
            }
            if (command === 'cmd_status') {
                await ctx.reply(await statusText(chatId, hostCtx, state, queue));
                await ctx.answerCallbackQuery();
                return;
            }
            if (command === 'cmd_menu') {
                await ctx.reply('设置面板', { reply_markup: settingsKeyboard() });
                await ctx.answerCallbackQuery();
                return;
            }
            if (command === 'cmd_compact') {
                await runCompact(chatId, hostCtx, api, state, async (id, text) => {
                    await bot.api.sendMessage(id, text);
                });
                await ctx.answerCallbackQuery('压缩已处理');
                return;
            }
            if (command === 'cmd_help') {
                await ctx.reply('📋 命令菜单', { reply_markup: commandMenuKeyboard() });
                await ctx.answerCallbackQuery();
                return;
            }
            await ctx.answerCallbackQuery('未知命令');
        }
        catch (error) {
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
    bot.callbackQuery(/^model\|/, async (ctx) => {
        const parts = decodeData(ctx.callbackQuery.data);
        if (parts.length < 3) {
            await ctx.answerCallbackQuery('无效的模型数据');
            return;
        }
        const [, provider, model] = parts;
        const chatId = ctx.chat.id;
        try {
            const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
            await settings.selectModel(chatId, sessionId, provider, model);
            await ctx.answerCallbackQuery('已切换模型');
            await ctx.editMessageText(`已选择模型：${provider}/${model}`);
        }
        catch (error) {
            await ctx.answerCallbackQuery('切换失败');
            await ctx.editMessageText(`切换模型失败：${error instanceof Error ? error.message : String(error)}`);
        }
    });
    bot.callbackQuery('efforts', async (ctx) => {
        const chatId = ctx.chat.id;
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
        }
        catch (error) {
            await ctx.editMessageText(`读取思考强度失败：${error instanceof Error ? error.message : String(error)}`);
        }
        await ctx.answerCallbackQuery();
    });
    bot.callbackQuery(/^effort\|/, async (ctx) => {
        const parts = decodeData(ctx.callbackQuery.data);
        if (parts.length < 4) {
            await ctx.answerCallbackQuery('无效的思考强度数据');
            return;
        }
        const [, provider, model, effort] = parts;
        const chatId = ctx.chat.id;
        try {
            const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
            await settings.selectModel(chatId, sessionId, provider, model, effort);
            await ctx.answerCallbackQuery('已切换思考强度');
            await ctx.editMessageText(`已选择思考强度：${effort}`);
        }
        catch (error) {
            await ctx.answerCallbackQuery('切换失败');
            await ctx.editMessageText(`切换思考强度失败：${error instanceof Error ? error.message : String(error)}`);
        }
    });
    bot.callbackQuery('presets', async (ctx) => {
        const chatId = ctx.chat.id;
        try {
            const presets = await settings.listPresets();
            const currentPreset = state.getChatSettings(chatId).agentPreset;
            const page = presetsKeyboard(presets, currentPreset);
            await ctx.editMessageText(page.text, { reply_markup: page.keyboard });
        }
        catch (error) {
            await ctx.editMessageText(`读取 preset 失败：${error instanceof Error ? error.message : String(error)}`);
        }
        await ctx.answerCallbackQuery();
    });
    bot.callbackQuery(/^preset\|/, async (ctx) => {
        const parts = decodeData(ctx.callbackQuery.data);
        if (parts.length < 2) {
            await ctx.answerCallbackQuery('无效的 preset 数据');
            return;
        }
        const [, preset] = parts;
        const chatId = ctx.chat.id;
        try {
            const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
            await settings.selectPreset(chatId, sessionId, preset);
            await ctx.answerCallbackQuery('已切换 preset');
            await ctx.editMessageText(`已选择 preset：${preset}`);
        }
        catch (error) {
            await ctx.answerCallbackQuery('切换失败');
            await ctx.editMessageText(`切换 preset 失败：${error instanceof Error ? error.message : String(error)}`);
        }
    });
    // Plain text messages
    bot.on('message:text', async (ctx) => {
        const text = ctx.message.text;
        if (text.startsWith('/'))
            return;
        state.incrementUserMessage(ctx.chat.id);
        const accepted = queue.enqueue(ctx.chat.id, text);
        if (!accepted) {
            await ctx.reply('队列已满，请等待当前任务完成后再发送。');
            return;
        }
        if (!pending.has(ctx.chat.id)) {
            const sent = await ctx.reply('🐋 Deep diving...');
            pending.set(bot, ctx.chat.id, sent.message_id);
        }
        await ctx.replyWithChatAction('typing');
    });
    await bot.init();
    await setupCommandMenu(bot, config.ownerId, config.botToken);
    void bot.start({
        onStart: () => console.log('dsh-telegram-bridge started'),
    }).catch((error) => {
        console.error('dsh-telegram-bridge stopped with error', redactToken(error, config.botToken));
    });
    return {
        stop: async () => {
            await bot.stop();
        },
    };
}
async function showModelsPage(ctx, page, sessions, settings, state) {
    const chatId = ctx.chat.id;
    try {
        const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
        const models = await settings.getModels(sessionId);
        const current = state.getChatSettings(chatId);
        const pageData = modelsPageKeyboard(models, current, page);
        await ctx.editMessageText(pageData.text, { reply_markup: pageData.keyboard });
    }
    catch (error) {
        await ctx.editMessageText(`读取模型失败：${error instanceof Error ? error.message : String(error)}`);
    }
    await ctx.answerCallbackQuery();
}
async function cancelCurrent(chatId, ctx, state, queue) {
    queue.clear(chatId);
    const chat = state.getChatState(chatId);
    if (!chat)
        return;
    const agent = ctx.agents.get(chat.sessionId);
    if (agent) {
        agent.cancel({ kind: 'user' });
    }
}
async function statusText(chatId, ctx, state, queue) {
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
    const lines = [
        `忙碌：${busy ? '是' : '否'}`,
        `会话：${chat?.sessionId ?? '无'}`,
        `队列：${queue.queueLength(chatId)}`,
        `提供方：${provider}`,
        `模型：${model}`,
        `思考强度：${settings.reasoningEffort ?? '默认'}`,
        `Preset：${settings.agentPreset ?? '默认'}（${lockText}）`,
        `消息：用户 ${stats.userMessages} / 助手 ${stats.assistantMessages}`,
        `Token：入 ${stats.inputTokens} / 出 ${stats.outputTokens}${stats.cacheReadTokens || stats.cacheWriteTokens ? `，缓存 ${stats.cacheReadTokens ?? 0}/${stats.cacheWriteTokens ?? 0}` : ''}`,
    ];
    return lines.join('\n');
}
async function runCompact(chatId, ctx, api, state, send) {
    const chat = state.getChatState(chatId);
    if (!chat) {
        await send(chatId, '当前没有会话。');
        return;
    }
    const compaction = ctx.get('compaction');
    const agent = ctx.agents.get(chat.sessionId);
    if (compaction && agent) {
        try {
            await compaction.compactNow(agent, new AbortController().signal);
            await send(chatId, '压缩完成。');
            return;
        }
        catch (error) {
            await send(chatId, `压缩失败：${error instanceof Error ? error.message : String(error)}`);
            return;
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
        await send(chatId, `压缩失败：${JSON.stringify(res.result.error)}`);
        return;
    }
    await send(chatId, '已请求压缩。');
}
async function setupCommandMenu(bot, ownerId, botToken) {
    try {
        await bot.api.setMyCommands([
            { command: 'new', description: '开始新对话' },
            { command: 'cancel', description: '取消当前任务并清空队列' },
            { command: 'status', description: '查看状态' },
            { command: 'help', description: '帮助' },
            { command: 'menu', description: '打开设置面板' },
            { command: 'compact', description: '压缩上下文' },
            { command: 'commands', description: '打开聊天内命令菜单' },
        ]);
        await bot.api.setChatMenuButton({
            chat_id: ownerId,
            menu_button: { type: 'commands' },
        });
        await bot.api.setChatMenuButton({
            menu_button: { type: 'commands' },
        });
    }
    catch (error) {
        console.error('Failed to setup command menu', redactToken(error, botToken));
    }
}
