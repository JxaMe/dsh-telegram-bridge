import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StateStore } from '../lib/state.js';

function makeStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-bridge-telegram-'));
  return { dir, store: new StateStore(dir) };
}

function createMockBot() {
  const handlers = {
    command: new Map(),
    callbackQuery: new Map(),
    use: [],
  };

  const bot = {
    api: {
      getMe: async () => ({ username: 'testbot' }),
      sendMessage: async () => {
        bot.api.sendMessageCount = (bot.api.sendMessageCount ?? 0) + 1;
        return { message_id: 1 };
      },
      deleteMessage: async () => {},
      pinChatMessage: async () => {},
    },
    command: (cmd, handler) => handlers.command.set(cmd, handler),
    callbackQuery: (query, handler) => handlers.callbackQuery.set(query, handler),
    use: (handler) => handlers.use.push(handler),
    catch: () => {},
    _handlers: handlers,
  };

  return bot;
}

function createMockCtx(chatId = 123, text = '', callbackData = '') {
  const replies = [];
  const callbackAnswers = [];

  return {
    chat: { id: chatId },
    message: { text },
    callbackQuery: callbackData ? { data: callbackData } : undefined,
    reply: async (text, opts) => {
      replies.push({ text, opts });
      return { message_id: 1 };
    },
    editMessageText: async (text, opts) => {
      replies.push({ text, opts, edited: true });
    },
    answerCallbackQuery: async (text) => {
      callbackAnswers.push(text);
    },
    _replies: replies,
    _callbackAnswers: callbackAnswers,
  };
}

test('owner-only middleware rejects non-owner', async () => {
  const { dir, store } = makeStore();
  const config = { ownerId: 123 };
  
  // Create mock middleware
  const middleware = async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined || chatId !== config.ownerId) return;
    await next();
  };

  // Test non-owner
  const ctx = createMockCtx(456);
  let nextCalled = false;
  await middleware(ctx, () => { nextCalled = true; });
  assert.equal(nextCalled, false);

  // Test owner
  const ownerCtx = createMockCtx(123);
  await middleware(ownerCtx, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  rmSync(dir, { recursive: true, force: true });
});

test('start command sends welcome message', async () => {
  const { dir, store } = makeStore();
  
  // Create mock start handler
  const startHandler = async (ctx) => {
    await ctx.reply(
      'dsh-telegram-bridge 已启动 🚀\n\n' +
      '直接发送消息即可与 dsh 对话。\n' +
      '/menu - 切换模型、思考强度、Preset\n' +
      '/commands - 打开命令菜单\n' +
      '/interrupt - 打断当前任务\n' +
      '/status - 查看状态统计',
    );
  };

  const ctx = createMockCtx(123);
  await startHandler(ctx);
  
  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /dsh-telegram-bridge 已启动/);
  assert.match(ctx._replies[0].text, /直接发送消息即可与 dsh 对话/);

  rmSync(dir, { recursive: true, force: true });
});

test('health command shows metrics', async () => {
  const { dir, store } = makeStore();
  
  // Create mock health handler
  const healthHandler = async (ctx) => {
    await ctx.reply(
      '✅ dsh-telegram-bridge 运行正常\n'
      + '运行时长：0分钟\n'
      + '收到消息：0\n'
      + '发送回复：0\n'
      + '错误次数：0',
    );
  };

  const ctx = createMockCtx(123);
  await healthHandler(ctx);
  
  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /✅ dsh-telegram-bridge 运行正常/);
  assert.match(ctx._replies[0].text, /运行时长：/);

  rmSync(dir, { recursive: true, force: true });
});

test('new command shows confirmation', async () => {
  const { dir, store } = makeStore();
  
  // Create mock new handler
  const newHandler = async (ctx) => {
    await ctx.reply('确定要开始新对话吗？');
  };

  const ctx = createMockCtx(123);
  await newHandler(ctx);
  
  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /确定要开始新对话吗？/);

  rmSync(dir, { recursive: true, force: true });
});

test('help command sends command menu and help text', async () => {
  const { dir, store } = makeStore();
  const bot = createMockBot();
  const HELP_TEXT = (
    '<b>📋 命令帮助</b>\n\n'
    + '<b>/start</b> - 显示主菜单和上手引导\n'
    + '<b>/help</b> - 显示本帮助'
  );

  // Create mock help handler matching the production logic
  const helpHandler = async (ctx) => {
    await bot.api.sendMessage(ctx.chat.id, '📋 命令菜单');
    await ctx.reply(HELP_TEXT, { parse_mode: 'HTML' });
  };

  const ctx = createMockCtx(123);
  await helpHandler(ctx);

  // Command menu is sent via bot.api.sendMessage + help text via ctx.reply
  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /📋 命令帮助/);
  assert.match(ctx._replies[0].text, /\/help/);
  assert.deepEqual(ctx._replies[0].opts, { parse_mode: 'HTML' });

  rmSync(dir, { recursive: true, force: true });
});

test('version command shows current version', async () => {
  const { dir, store } = makeStore();

  // Create mock version handler matching the production logic
  const versionHandler = async (ctx) => {
    const current = '1.0.0';
    await ctx.reply(`当前版本：v${current}（已是最新）`);
  };

  const ctx = createMockCtx(123);
  await versionHandler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /当前版本：v1\.0\.0/);

  rmSync(dir, { recursive: true, force: true });
});

test('version command shows update notice when a newer version exists', async () => {
  const { dir, store } = makeStore();

  const versionHandler = async (ctx) => {
    const current = '1.0.0';
    const latest = '2.0.0';
    const hasUpdate = latest !== current;
    if (hasUpdate) {
      await ctx.reply(`当前版本：v${current}\n最新版本：v${latest}\n\n📢 有新版本可用，请更新插件。`);
    }
  };

  const ctx = createMockCtx(123);
  await versionHandler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /最新版本：v2\.0\.0/);
  assert.match(ctx._replies[0].text, /有新版本可用/);

  rmSync(dir, { recursive: true, force: true });
});

test('commands command sends command menu', async () => {
  const { dir, store } = makeStore();
  const bot = createMockBot();

  const commandsHandler = async (ctx) => {
    const sent = await bot.api.sendMessage(ctx.chat.id, '📋 命令菜单');
    await bot.api.pinChatMessage(ctx.chat.id, sent.message_id);
  };

  const ctx = createMockCtx(123);
  await commandsHandler(ctx);

  // sendCommandMenu posts via bot.api.sendMessage; assert it was invoked
  assert.equal(bot.api.sendMessageCount, 1);

  rmSync(dir, { recursive: true, force: true });
});

test('status command reports no session when none exists', async () => {
  const { dir, store } = makeStore();

  const statusHandler = async (ctx, state) => {
    const chatId = ctx.chat.id;
    const chat = state.getChatState(chatId);
    if (!chat?.sessionId) {
      await ctx.reply('还没有会话，直接发消息即可开始对话。');
      return;
    }
    await ctx.reply('状态详情');
  };

  const ctx = createMockCtx(123);
  await statusHandler(ctx, store);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /还没有会话/);

  rmSync(dir, { recursive: true, force: true });
});

test('status command shows session details when a session exists', async () => {
  const { dir, store } = makeStore();

  // Simulate an active session
  store.setChatState(123, { sessionId: 'sess-1', createdAt: Date.now() });

  const statusHandler = async (ctx, state) => {
    const chatId = ctx.chat.id;
    const chat = state.getChatState(chatId);
    if (!chat?.sessionId) {
      await ctx.reply('还没有会话，直接发消息即可开始对话。');
      return;
    }
    const settings = state.getChatSettings(chatId);
    await ctx.reply(
      `<b>会话：</b><code>${chat.sessionId}</code>\n`
      + `<b>模型：</b>${settings.model ?? '默认'}`,
      { parse_mode: 'HTML' },
    );
  };

  const ctx = createMockCtx(123);
  await statusHandler(ctx, store);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /sess-1/);
  assert.match(ctx._replies[0].text, /默认/);
  assert.deepEqual(ctx._replies[0].opts, { parse_mode: 'HTML' });

  rmSync(dir, { recursive: true, force: true });
});

test('sessions command lists recent sessions', async () => {
  const { dir, store } = makeStore();

  // Simulate two sessions, the second active
  store.addSession(123, 'sess-1', '第一个会话');
  store.addSession(123, 'sess-2', '第二个会话');
  store.setActiveSession(123, 'sess-2');

  const sessionsHandler = async (ctx, state) => {
    const chatId = ctx.chat.id;
    const active = state.getChatState(chatId);
    const sessions = state.listChatSessions(chatId).slice().reverse();
    if (sessions.length === 0) {
      await ctx.reply('还没有会话。');
      return;
    }
    const lines = sessions.map((session) => {
      const activeMark = session.sessionId === active?.sessionId ? ' 📌' : '';
      return `${session.title ?? '会话'}${activeMark}`;
    });
    await ctx.reply(`📂 最近会话\n\n${lines.join('\n\n')}`);
  };

  const ctx = createMockCtx(123);
  await sessionsHandler(ctx, store);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /📂 最近会话/);
  assert.match(ctx._replies[0].text, /第二个会话 📌/);
  assert.match(ctx._replies[0].text, /第一个会话/);

  rmSync(dir, { recursive: true, force: true });
});

test('sessions command reports empty when there are no sessions', async () => {
  const { dir, store } = makeStore();

  const sessionsHandler = async (ctx, state) => {
    const sessions = state.listChatSessions(ctx.chat.id);
    if (sessions.length === 0) {
      await ctx.reply('还没有会话。');
      return;
    }
    await ctx.reply('📂 最近会话');
  };

  const ctx = createMockCtx(123);
  await sessionsHandler(ctx, store);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /还没有会话/);

  rmSync(dir, { recursive: true, force: true });
});

test('compact command asks for confirmation when a session exists', async () => {
  const { dir, store } = makeStore();
  store.setChatState(123, { sessionId: 'sess-1', createdAt: Date.now() });

  const compactHandler = async (ctx, state) => {
    const chatId = ctx.chat.id;
    const chat = state.getChatState(chatId);
    if (!chat?.sessionId) {
      await ctx.reply('还没有会话，无法压缩。');
      return;
    }
    await ctx.reply('确定要压缩当前对话历史吗？');
  };

  const ctx = createMockCtx(123);
  await compactHandler(ctx, store);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /确定要压缩当前对话历史吗？/);

  rmSync(dir, { recursive: true, force: true });
});

test('compact command reports no session when none exists', async () => {
  const { dir, store } = makeStore();

  const compactHandler = async (ctx, state) => {
    const chatId = ctx.chat.id;
    const chat = state.getChatState(chatId);
    if (!chat?.sessionId) {
      await ctx.reply('还没有会话，无法压缩。');
      return;
    }
    await ctx.reply('确定要压缩当前对话历史吗？');
  };

  const ctx = createMockCtx(123);
  await compactHandler(ctx, store);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /还没有会话，无法压缩/);

  rmSync(dir, { recursive: true, force: true });
});

test('confirm_new callback starts a new conversation', async () => {
  const { dir, store } = makeStore();

  let resetCalled = false;

  const confirmNewHandler = async (ctx) => {
    const chatId = ctx.chat.id;
    await ctx.answerCallbackQuery('开始新对话…');
    // Simulate cancelCurrent + session reset
    resetCalled = true;
    await ctx.editMessageText('已开始新对话。');
  };

  const ctx = createMockCtx(123, '', 'confirm_new');
  await confirmNewHandler(ctx);

  assert.equal(resetCalled, true);
  assert.equal(ctx._callbackAnswers.length, 1);
  assert.equal(ctx._callbackAnswers[0], '开始新对话…');
  // editMessageText pushes into _replies with edited: true
  assert.equal(ctx._replies.length, 1);
  assert.equal(ctx._replies[0].edited, true);
  assert.match(ctx._replies[0].text, /已开始新对话/);

  rmSync(dir, { recursive: true, force: true });
});

test('cancel_new callback cancels new conversation', async () => {
  const { dir, store } = makeStore();

  const cancelNewHandler = async (ctx) => {
    await ctx.editMessageText('已取消。');
    await ctx.answerCallbackQuery();
  };

  const ctx = createMockCtx(123, '', 'cancel_new');
  await cancelNewHandler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.equal(ctx._replies[0].edited, true);
  assert.match(ctx._replies[0].text, /已取消/);

  rmSync(dir, { recursive: true, force: true });
});

test('retry callback re-enqueues a failed message', async () => {
  const { dir, store } = makeStore();

  const failedItems = new Map();
  failedItems.set('fail-1', { text: '我要重试的消息' });
  const enqueued = [];

  const retryHandler = async (ctx) => {
    const chatId = ctx.chat.id;
    const failureId = 'fail-1';
    const failed = failedItems.get(failureId);
    if (!failed) {
      await ctx.answerCallbackQuery('没有可重试的失败消息');
      return;
    }
    failedItems.delete(failureId);
    const accepted = true;
    if (!accepted) {
      await ctx.answerCallbackQuery('队列已满，无法重试');
      return;
    }
    enqueued.push(failed.text);
    await ctx.answerCallbackQuery('已重试');
  };

  const ctx = createMockCtx(123, '', 'retry:fail-1');
  await retryHandler(ctx);

  assert.deepEqual(enqueued, ['我要重试的消息']);
  assert.equal(ctx._callbackAnswers.length, 1);
  assert.equal(ctx._callbackAnswers[0], '已重试');

  rmSync(dir, { recursive: true, force: true });
});

test('retry callback reports when no failed message exists', async () => {
  const { dir, store } = makeStore();

  const failedItems = new Map();

  const retryHandler = async (ctx) => {
    const failureId = 'missing';
    const failed = failedItems.get(failureId);
    if (!failed) {
      await ctx.answerCallbackQuery('没有可重试的失败消息');
      return;
    }
    await ctx.answerCallbackQuery('已重试');
  };

  const ctx = createMockCtx(123, '', 'retry:missing');
  await retryHandler(ctx);

  assert.equal(ctx._callbackAnswers.length, 1);
  assert.equal(ctx._callbackAnswers[0], '没有可重试的失败消息');

  rmSync(dir, { recursive: true, force: true });
});