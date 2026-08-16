import { Bot, InlineKeyboard } from 'grammy';
import { createProxiedFetch } from './proxy-fetch.js';
import { EventForwarder } from './forwarder.js';
import { PendingStatus } from './pending-status.js';
import { createRpcId } from './rpc.js';
import { mainMenuKeyboard, settingsKeyboard } from './menu.js';
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
        console.error('dsh-telegram-bridge middleware error:', err.error);
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
    const forwarder = new EventForwarder(hostCtx, bot, state, pending);
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
        await ctx.reply('命令：/new /cancel /status /help /menu /compact');
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
    bot.callbackQuery('models', async (ctx) => {
        const chatId = ctx.chat.id;
        try {
            const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
            const models = await settings.getModels(sessionId);
            const keyboard = new InlineKeyboard();
            for (const group of models.groups) {
                for (const model of group.models) {
                    const data = encodeData(['model', group.id, model.id]);
                    keyboard.text(`${group.id}/${model.id}`, data).row();
                }
            }
            await ctx.editMessageText('选择模型', { reply_markup: keyboard });
        }
        catch (error) {
            await ctx.editMessageText(`读取模型失败：${error instanceof Error ? error.message : String(error)}`);
        }
        await ctx.answerCallbackQuery();
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
            const keyboard = new InlineKeyboard();
            for (const effort of efforts) {
                keyboard.text(effort.name ?? effort.id, encodeData(['effort', provider, model, effort.id])).row();
            }
            await ctx.editMessageText(`选择思考强度（${provider}/${model}）`, { reply_markup: keyboard });
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
            const keyboard = new InlineKeyboard();
            for (const preset of presets) {
                keyboard.text(preset.name ?? preset.id, encodeData(['preset', preset.id])).row();
            }
            await ctx.editMessageText('选择 Agent preset', { reply_markup: keyboard });
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
        queue.enqueue(ctx.chat.id, text);
        const sent = await ctx.reply('🌊 Deep diving...');
        pending.set(ctx.chat.id, sent.message_id);
        await ctx.replyWithChatAction('typing');
    });
    await bot.init();
    await setupCommandMenu(bot, config.ownerId);
    void bot.start({
        onStart: () => console.log('dsh-telegram-bridge started'),
    }).catch((error) => {
        console.error('dsh-telegram-bridge stopped with error', error);
    });
    return {
        stop: async () => {
            await bot.stop();
        },
    };
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
    const lines = [
        `Session: ${chat?.sessionId ?? 'none'}`,
        `Queue: ${queue.queueLength(chatId)}`,
        `Model: ${settings.model ?? 'default'}`,
        `Provider: ${settings.provider ?? 'default'}`,
        `Reasoning: ${settings.reasoningEffort ?? 'default'}`,
        `Preset: ${settings.agentPreset ?? 'default'}`,
    ];
    if (chat?.sessionId) {
        const agent = ctx.agents.get(chat.sessionId);
        lines.push(`Agent active: ${agent ? 'yes' : 'no'}`);
    }
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
async function setupCommandMenu(bot, ownerId) {
    try {
        await bot.api.setMyCommands([
            { command: 'new', description: '开始新对话' },
            { command: 'cancel', description: '取消当前任务并清空队列' },
            { command: 'status', description: '查看状态' },
            { command: 'help', description: '帮助' },
            { command: 'menu', description: '打开设置面板' },
            { command: 'compact', description: '压缩上下文' },
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
        console.error('Failed to setup command menu', error);
    }
}
function encodeData(parts) {
    return parts.map((part) => encodeURIComponent(part)).join('|');
}
function decodeData(data) {
    return data.split('|').map((part) => decodeURIComponent(part));
}
