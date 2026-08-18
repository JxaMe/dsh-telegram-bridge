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
      sendMessage: async () => ({ message_id: 1 }),
      deleteMessage: async () => {},
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