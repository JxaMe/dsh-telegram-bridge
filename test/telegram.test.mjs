import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StateStore } from '../lib/state.js';
import { PendingStatus } from '../lib/pending-status.js';
import { SettingsManager } from '../lib/settings.js';
import { SessionManager } from '../lib/session.js';
import { QueueManager } from '../lib/queue.js';
import { registerTelegramHandlers } from '../lib/telegram.js';
import { encodeCallback } from '../lib/callback.js';

function makeStore() {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-bridge-telegram-'));
  return { dir, store: new StateStore(dir) };
}

function makeConfig(overrides = {}) {
  return {
    botToken: 'test-token',
    ownerId: 123,
    projectRoot: '/tmp',
    proxyEnabled: false,
    proxyUrl: '',
    defaultProvider: '',
    defaultModel: '',
    defaultReasoningEffort: '',
    defaultAgentPreset: '',
    errorDisplayMode: 'raw',
    htmlFormatting: true,
    typingIndicator: true,
    queueLimit: 20,
    debugLogging: false,
    statusLine: true,
    maxSessionsPerChat: 5,
    ...overrides,
  };
}

function makeStubApi() {
  return {
    sessions: {
      create: async () => ({ result: { ok: true, value: { sessionId: 'sess-new' } } }),
      selectModel: async () => ({ result: { ok: true, value: {} } }),
      models: async () => ({ result: { ok: true, value: {} } }),
      prompt: async () => ({ result: { ok: true, value: {} } }),
    },
    agentPresets: {
      list: async () => ({ result: { ok: true, value: { presets: [] } } }),
      select: async () => ({ result: { ok: true, value: {} } }),
    },
  };
}

function makeRuntime({ store, api, config, checkLatestVersion, typingEnabled = true }) {
  const pending = new PendingStatus();
  const settings = new SettingsManager(api, store);
  const sessions = new SessionManager(api, store, '/tmp', {}, undefined, 5);
  const queue = new QueueManager(api, sessions, store, undefined, config.queueLimit ?? 20, undefined);
  return {
    hostCtx: {
      agents: { get: () => undefined },
      get: () => undefined,
      commands: undefined,
    },
    api,
    config,
    state: store,
    pending,
    settings,
    sessions,
    queue,
    typingEnabled,
    proxyUrl: '',
    debugLog: () => {},
    checkLatestVersion: checkLatestVersion ?? (async () => ({ latest: '1.2.0', hasUpdate: false })),
  };
}

function createMockBot() {
  const handlers = {
    command: new Map(),
    callbackQuery: new Map(),
    use: [],
    on: new Map(),
  };

  const bot = {
    api: {
      getMe: async () => ({ username: 'testbot' }),
      sendMessage: async () => {
        bot.api.sendMessageCount = (bot.api.sendMessageCount ?? 0) + 1;
        return { message_id: 1 };
      },
      deleteMessage: async () => {},
      pinChatMessage: async () => {
        bot.api.pinChatMessageCount = (bot.api.pinChatMessageCount ?? 0) + 1;
      },
      sendChatAction: async () => {},
      setMyCommands: async () => {},
      setChatMenuButton: async () => {},
    },
    command: (cmd, handler) => handlers.command.set(cmd, handler),
    callbackQuery: (query, handler) => handlers.callbackQuery.set(query, handler),
    use: (handler) => handlers.use.push(handler),
    on: (event, handler) => handlers.on.set(event, handler),
    catch: () => {},
    init: async () => {},
    _handlers: handlers,
  };

  return bot;
}

function getCallbackHandler(bot, pattern) {
  for (const [key, handler] of bot._handlers.callbackQuery) {
    if (key instanceof RegExp && key.source === pattern.source) return handler;
    if (key === pattern) return handler;
  }
  return undefined;
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
    replyWithChatAction: async () => {},
    _replies: replies,
    _callbackAnswers: callbackAnswers,
  };
}

function setupHandlers(overrides = {}) {
  const { dir, store } = makeStore();
  const config = makeConfig(overrides.config);
  const api = overrides.api ?? makeStubApi();
  const bot = createMockBot();
  const runtime = makeRuntime({
    store,
    api,
    config,
    checkLatestVersion: overrides.checkLatestVersion,
    typingEnabled: overrides.typingEnabled,
  });
  registerTelegramHandlers(bot, runtime);
  return { dir, store, config, api, bot, runtime };
}

test('owner-only middleware rejects non-owner', async () => {
  const { dir, bot } = setupHandlers();

  const middleware = bot._handlers.use[0];
  let nextCalled = false;

  await middleware(createMockCtx(456), () => { nextCalled = true; });
  assert.equal(nextCalled, false);

  await middleware(createMockCtx(123), () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  rmSync(dir, { recursive: true, force: true });
});

test('start command sends welcome message', async () => {
  const { dir, bot } = setupHandlers();
  const handler = bot._handlers.command.get('start');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /dsh-telegram-bridge 已启动/);
  assert.match(ctx._replies[0].text, /直接发送消息即可与 dsh 对话/);

  rmSync(dir, { recursive: true, force: true });
});

test('health command shows metrics', async () => {
  const { dir, bot } = setupHandlers();
  const handler = bot._handlers.command.get('health');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /✅ dsh-telegram-bridge 运行正常/);
  assert.match(ctx._replies[0].text, /运行时长：/);

  rmSync(dir, { recursive: true, force: true });
});

test('new command shows confirmation', async () => {
  const { dir, bot } = setupHandlers();
  const handler = bot._handlers.command.get('new');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /确定要开始新对话吗？/);

  rmSync(dir, { recursive: true, force: true });
});

test('help command sends command menu and help text', async () => {
  const { dir, bot } = setupHandlers();
  const handler = bot._handlers.command.get('help');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(bot.api.sendMessageCount, 1);
  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /📋 命令帮助/);
  assert.match(ctx._replies[0].text, /\/help/);
  assert.deepEqual(ctx._replies[0].opts, { parse_mode: 'HTML' });

  rmSync(dir, { recursive: true, force: true });
});

test('version command shows current version', async () => {
  const { dir, bot } = setupHandlers({
    checkLatestVersion: async () => ({ latest: '1.2.0', hasUpdate: false }),
  });
  const handler = bot._handlers.command.get('version');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /当前版本：v1\.2\.0/);
  assert.match(ctx._replies[0].text, /已是最新/);

  rmSync(dir, { recursive: true, force: true });
});

test('version command shows update notice when a newer version exists', async () => {
  const { dir, bot } = setupHandlers({
    checkLatestVersion: async () => ({ latest: '2.0.0', hasUpdate: true, url: 'https://example.com/releases' }),
  });
  const handler = bot._handlers.command.get('version');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /最新版本：v2\.0\.0/);
  assert.match(ctx._replies[0].text, /有新版本可用/);

  rmSync(dir, { recursive: true, force: true });
});

test('commands command sends command menu', async () => {
  const { dir, bot } = setupHandlers();
  const handler = bot._handlers.command.get('commands');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(bot.api.sendMessageCount, 1);
  assert.equal(bot.api.pinChatMessageCount, 1);

  rmSync(dir, { recursive: true, force: true });
});

test('status command reports no session when none exists', async () => {
  const { dir, bot } = setupHandlers();
  const handler = bot._handlers.command.get('status');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /还没有会话/);

  rmSync(dir, { recursive: true, force: true });
});

test('status command shows session details when a session exists', async () => {
  const { dir, store, bot } = setupHandlers();
  store.setChatState(123, { sessionId: 'sess-1', createdAt: Date.now() });

  const handler = bot._handlers.command.get('status');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /sess-1/);
  assert.match(ctx._replies[0].text, /默认/);
  assert.deepEqual(ctx._replies[0].opts, { parse_mode: 'HTML' });

  rmSync(dir, { recursive: true, force: true });
});

test('sessions command lists recent sessions', async () => {
  const { dir, store, bot } = setupHandlers();
  store.addSession(123, 'sess-1', '第一个会话');
  store.addSession(123, 'sess-2', '第二个会话');
  store.setActiveSession(123, 'sess-2');

  const handler = bot._handlers.command.get('sessions');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /📂 最近会话/);
  assert.match(ctx._replies[0].text, /第二个会话 📌/);
  assert.match(ctx._replies[0].text, /第一个会话/);

  rmSync(dir, { recursive: true, force: true });
});

test('sessions command reports empty when there are no sessions', async () => {
  const { dir, bot } = setupHandlers();
  const handler = bot._handlers.command.get('sessions');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /还没有会话/);

  rmSync(dir, { recursive: true, force: true });
});

test('compact command asks for confirmation when a session exists', async () => {
  const { dir, store, bot } = setupHandlers();
  store.setChatState(123, { sessionId: 'sess-1', createdAt: Date.now() });

  const handler = bot._handlers.command.get('compact');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /确定要压缩当前对话历史吗？/);

  rmSync(dir, { recursive: true, force: true });
});

test('compact command reports no session when none exists', async () => {
  const { dir, bot } = setupHandlers();
  const handler = bot._handlers.command.get('compact');
  const ctx = createMockCtx(123);

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.match(ctx._replies[0].text, /还没有会话，无法压缩/);

  rmSync(dir, { recursive: true, force: true });
});

test('confirm_new callback starts a new conversation', async () => {
  const { dir, store, bot, runtime } = setupHandlers();
  store.setChatState(123, { sessionId: 'old-session', createdAt: Date.now() });

  const handler = bot._handlers.callbackQuery.get('confirm_new');
  const ctx = createMockCtx(123, '', 'confirm_new');

  await handler(ctx);

  assert.equal(ctx._callbackAnswers.length, 1);
  assert.equal(ctx._callbackAnswers[0], '开始新对话…');
  assert.equal(ctx._replies.length, 1);
  assert.equal(ctx._replies[0].edited, true);
  assert.match(ctx._replies[0].text, /已开始新对话/);
  const chat = store.getChatState(123);
  assert.equal(chat?.sessionId, 'sess-new');

  rmSync(dir, { recursive: true, force: true });
});

test('cancel_new callback cancels new conversation', async () => {
  const { dir, bot } = setupHandlers();
  const handler = bot._handlers.callbackQuery.get('cancel_new');
  const ctx = createMockCtx(123, '', 'cancel_new');

  await handler(ctx);

  assert.equal(ctx._replies.length, 1);
  assert.equal(ctx._replies[0].edited, true);
  assert.match(ctx._replies[0].text, /已取消/);

  rmSync(dir, { recursive: true, force: true });
});

test('retry callback re-enqueues a failed message', async () => {
  const api = makeStubApi();
  let resolveCreate;
  api.sessions.create = () => new Promise((resolve) => { resolveCreate = resolve; });
  const { dir, bot, runtime } = setupHandlers({ api, typingEnabled: false });
  runtime.queue.failedItems.set(123, new Map([['fail-1', { chatId: 123, text: '我要重试的消息' }]]));

  const handler = getCallbackHandler(bot, /^retry:/);
  const ctx = createMockCtx(123, '', encodeCallback(['retry', 'fail-1']));

  await handler(ctx);

  assert.equal(runtime.queue.getFailedItem(123, 'fail-1'), undefined);
  assert.equal(runtime.queue.isProcessing(123), true);
  assert.equal(ctx._callbackAnswers.length, 1);
  assert.equal(ctx._callbackAnswers[0], '已重试');

  resolveCreate({ result: { ok: true, value: { sessionId: 'sess-new' } } });
  await new Promise((resolve) => setImmediate(resolve));
  runtime.pending.dispose();
  rmSync(dir, { recursive: true, force: true });
});

test('retry callback reports when no failed message exists', async () => {
  const { dir, bot } = setupHandlers();
  const handler = getCallbackHandler(bot, /^retry:/);
  const ctx = createMockCtx(123, '', encodeCallback(['retry', 'missing']));

  await handler(ctx);

  assert.equal(ctx._callbackAnswers.length, 1);
  assert.equal(ctx._callbackAnswers[0], '没有可重试的失败消息');

  rmSync(dir, { recursive: true, force: true });
});
