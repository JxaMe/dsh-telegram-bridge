# dsh-telegram-bridge Implementation Plan

Date: 2026-08-17
Status: Approved design, ready for execution
Owner: dsh-telegram-bridge

## Goal

Implement a dsh profile plugin named `dsh-telegram-bridge` that bridges a Telegram private chat to a dsh agent session. The plugin must support text conversation, queueing, cancel, new-session, status, menu-driven model/reasoning/preset settings, context compaction, persistence, and Telegram long-polling reliability.

## Architecture

- dsh profile plugin bundle running inside `dsh web`.
- Telegram long polling via `grammy`.
- Uses `ctx.apiProxy`, `ctx.agents`, `ctx.compaction`, and `ctx.on('session/event')`.
- State persisted under `~/.dsh/dsh-telegram-bridge/`.

## Tech Stack

- TypeScript
- Node.js (dsh host)
- `grammy`
- `@deepseek-ai/cordis` (peer, provided by dsh)

## Baseline / Authority Refs

- Design Spec: `docs/aegis/specs/2026-08-17-dsh-telegram-bridge-design.md`
- dsh source: `/home/los/Projects/dsh-src`
- Aegis Method Pack installed at `/home/los/.dsh/profiles/web/node_modules/aegis`

## Compatibility Boundary

- Target profile: `web` first; code must not depend on web-only UI packages.
- `headless` is not a target.
- No group chat, no media, no proactive push.
- Queue is in-memory only.
- Agent preset switching only on blank sessions.

## TDD Route

```text
TDD Route:
- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Test posture: post-change regression / manual acceptance
- Reason: greenfield plugin, user asked to build first; no explicit strict TDD request
- Verification: pnpm build + local dsh plugin install + manual Telegram acceptance
```

## Verification

- `pnpm build` succeeds.
- `dsh plugin --profile web add <path>` succeeds.
- `dsh --profile web --dump-config` contains one `dsh-telegram-bridge` row.
- Manual Telegram acceptance per Design Spec section 11.

## File Map

```text
dsh-telegram-bridge/
├── package.json
├── tsconfig.json
├── extensions/dsh/cordis.patch.yml
├── src/
│   ├── types.ts
│   ├── config.ts
│   ├── state.ts
│   ├── session.ts
│   ├── queue.ts
│   ├── forwarder.ts
│   ├── settings.ts
│   ├── menu.ts
│   ├── telegram.ts
│   └── index.ts
└── docs/aegis/
```

---

## Task 1: Project scaffold

### Files
- `package.json`
- `tsconfig.json`

### Why
Create a buildable TypeScript dsh plugin package.

### Change Necessity
- User-visible need: runnable plugin package.
- No-change option: not possible; no package exists.
- Decision: code-change.

### Steps

1. Create `package.json`:

```json
{
  "name": "dsh-telegram-bridge",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/index.d.ts",
  "files": [
    "lib",
    "extensions"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "grammy": "^1.30.0"
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-host-apiproxy": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-agent": "^0.1.0-rc.6"
  },
  "devDependencies": {
    "@types/node": "^26.0.0",
    "typescript": "^5.9.0"
  },
  "dsh": {
    "bundle": {
      "patch": "./extensions/dsh/cordis.patch.yml"
    }
  }
}
```

2. Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "lib",
    "rootDir": "src",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

3. Run:

```bash
cd ~/Projects/dsh-telegram-bridge
pnpm install
pnpm typecheck
```

Expected: typecheck passes with no source files yet.

---

## Task 2: Types and config

### Files
- `src/types.ts`
- `src/config.ts`

### Why
Define plugin data shapes and load user configuration.

### Change Necessity
- User-visible need: configurable token/owner and typed state.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `src/types.ts`:

```ts
export interface PluginConfig {
  botToken: string;
  ownerId: number;
  projectRoot?: string;
  dataDir?: string;
}

export interface ChatState {
  sessionId: string;
  createdAt: number;
}

export interface ChatSettings {
  provider?: string;
  model?: string;
  reasoningEffort?: string;
  agentPreset?: string;
}

export interface PersistedState {
  chats: Record<string, ChatState>;
}

export interface PersistedSettings {
  chats: Record<string, ChatSettings>;
}

export interface QueueItem {
  chatId: number;
  text: string;
}
```

2. Create `src/config.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { PluginConfig } from './types.js';

export function defaultDataDir(): string {
  return path.join(homedir(), '.dsh', 'dsh-telegram-bridge');
}

export function loadConfig(dataDir = defaultDataDir()): PluginConfig {
  const configPath = path.join(dataDir, 'config.json');
  const raw = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<PluginConfig>;
  if (!parsed.botToken || typeof parsed.ownerId !== 'number') {
    throw new Error('config.json must contain botToken and ownerId');
  }
  return {
    botToken: parsed.botToken,
    ownerId: parsed.ownerId,
    projectRoot: parsed.projectRoot ?? process.cwd(),
    dataDir,
  };
}

export function ensureDataDir(dataDir = defaultDataDir()): void {
  mkdirSync(dataDir, { recursive: true });
}

export function writeExampleConfig(dataDir = defaultDataDir()): void {
  ensureDataDir(dataDir);
  const configPath = path.join(dataDir, 'config.json');
  if (existsSync(configPath)) return;
  writeFileSync(configPath, JSON.stringify({
    botToken: 'PASTE_BOT_TOKEN',
    ownerId: 0,
    projectRoot: process.cwd(),
  }, null, 2) + '\n', 'utf8');
}

function existsSync(p: string): boolean {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}
```

3. Run:

```bash
pnpm typecheck
```

---

## Task 3: State store

### Files
- `src/state.ts`

### Why
Persist chat → session mapping and user settings across restarts.

### Change Necessity
- User-visible need: restart recovery.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `src/state.ts`:

```ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ChatSettings, ChatState, PersistedSettings, PersistedState } from './types.js';

export class StateStore {
  private statePath: string;
  private settingsPath: string;

  constructor(private dataDir: string) {
    mkdirSync(dataDir, { recursive: true });
    this.statePath = path.join(dataDir, 'state.json');
    this.settingsPath = path.join(dataDir, 'settings.json');
  }

  loadState(): PersistedState {
    return this.readJson<PersistedState>(this.statePath, { chats: {} });
  }

  saveState(state: PersistedState): void {
    writeFileSync(this.statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }

  loadSettings(): PersistedSettings {
    return this.readJson<PersistedSettings>(this.settingsPath, { chats: {} });
  }

  saveSettings(settings: PersistedSettings): void {
    writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  }

  getChatState(chatId: number): ChatState | undefined {
    return this.loadState().chats[String(chatId)];
  }

  setChatState(chatId: number, state: ChatState): void {
    const all = this.loadState();
    all.chats[String(chatId)] = state;
    this.saveState(all);
  }

  getChatSettings(chatId: number): ChatSettings {
    return this.loadSettings().chats[String(chatId)] ?? {};
  }

  setChatSettings(chatId: number, settings: ChatSettings): void {
    const all = this.loadSettings();
    all.chats[String(chatId)] = settings;
    this.saveSettings(all);
  }

  private readJson<T>(file: string, fallback: T): T {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as T;
    } catch {
      return fallback;
    }
  }
}
```

2. Run:

```bash
pnpm typecheck
```

---

## Task 4: Session manager

### Files
- `src/session.ts`

### Why
Create/resume dsh sessions and maintain the chat mapping.

### Change Necessity
- User-visible need: conversation continuity and `/new`.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `src/session.ts`:

```ts
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy';
import type { StateStore } from './state.js';
import type { ChatSettings } from './types.js';

export class SessionManager {
  constructor(
    private api: ApiProxy,
    private state: StateStore,
    private projectRoot: string,
  ) {}

  async ensureSession(chatId: number, settings: ChatSettings): Promise<string> {
    const existing = this.state.getChatState(chatId);
    if (existing?.sessionId) {
      return existing.sessionId;
    }
    return this.createSession(chatId, settings);
  }

  async createSession(chatId: number, settings: ChatSettings): Promise<string> {
    const res = await this.api.sessions.create({
      cwd: this.projectRoot,
      agentPreset: settings.agentPreset,
    });
    if (!res.ok) {
      throw new Error(`create session failed: ${JSON.stringify(res.error)}`);
    }
    const sessionId = res.value.sessionId;
    this.state.setChatState(chatId, { sessionId, createdAt: Date.now() });
    return sessionId;
  }

  async resetSession(chatId: number, settings: ChatSettings): Promise<string> {
    return this.createSession(chatId, settings);
  }
}
```

2. Run:

```bash
pnpm typecheck
```

---

## Task 5: Queue manager

### Files
- `src/queue.ts`

### Why
Serialize user messages and support `/cancel`.

### Change Necessity
- User-visible need: ordered processing and cancellation.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `src/queue.ts`:

```ts
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy';
import type { SessionManager } from './session.js';
import type { StateStore } from './state.js';
import type { ChatSettings, QueueItem } from './types.js';

export class QueueManager {
  private queues = new Map<number, QueueItem[]>();
  private processing = new Map<number, boolean>();

  constructor(
    private api: ApiProxy,
    private sessions: SessionManager,
    private state: StateStore,
  ) {}

  enqueue(chatId: number, text: string): void {
    const queue = this.queues.get(chatId) ?? [];
    queue.push({ chatId, text });
    this.queues.set(chatId, queue);
    void this.drain(chatId);
  }

  clear(chatId: number): void {
    this.queues.set(chatId, []);
  }

  queueLength(chatId: number): number {
    return (this.queues.get(chatId) ?? []).length;
  }

  private async drain(chatId: number): Promise<void> {
    if (this.processing.get(chatId)) return;
    this.processing.set(chatId, true);
    try {
      while (true) {
        const queue = this.queues.get(chatId) ?? [];
        const item = queue.shift();
        if (!item) break;
        this.queues.set(chatId, queue);
        const settings = this.state.getChatSettings(chatId);
        const sessionId = await this.sessions.ensureSession(chatId, settings);
        const res = await this.api.sessions.prompt({
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: item.text }],
        });
        if (!res.ok) {
          throw new Error(`prompt failed: ${JSON.stringify(res.error)}`);
        }
      }
    } finally {
      this.processing.set(chatId, false);
    }
  }
}
```

2. Run:

```bash
pnpm typecheck
```

---

## Task 6: Event forwarder

### Files
- `src/forwarder.ts`

### Why
Forward dsh assistant messages back to Telegram.

### Change Necessity
- User-visible need: receive agent replies in Telegram.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `src/forwarder.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis';
import type { Bot } from 'grammy';
import type { StateStore } from './state.js';

export class EventForwarder {
  constructor(
    private ctx: Context,
    private bot: Bot,
    private state: StateStore,
  ) {}

  start(): void {
    this.ctx.on('session/event', (session, event) => {
      if (event.type !== 'assistant/message') return;
      const chatId = this.findChatId(session.id);
      if (chatId === undefined) return;
      const text = extractText(event.data.content);
      if (!text) return;
      void this.sendToTelegram(chatId, text);
    });
  }

  private findChatId(sessionId: string): number | undefined {
    const state = this.state.loadState();
    for (const [chatId, chat] of Object.entries(state.chats)) {
      if (chat.sessionId === sessionId) return Number(chatId);
    }
    return undefined;
  }

  private async sendToTelegram(chatId: number, text: string): Promise<void> {
    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
      } catch {
        await this.bot.api.sendMessage(chatId, chunk);
      }
    }
  }
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((block: any) => block?.type === 'text' ? String(block.text ?? '') : '')
    .join('\n')
    .trim();
}

function splitMessage(text: string, limit = 4096): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    chunks.push(text.slice(i, i + limit));
  }
  return chunks.length > 0 ? chunks : [''];
}
```

2. Run:

```bash
pnpm typecheck
```

---

## Task 7: Settings manager

### Files
- `src/settings.ts`

### Why
Dynamic model/reasoning/preset management.

### Change Necessity
- User-visible need: menu-driven settings.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `src/settings.ts`:

```ts
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy';
import type { StateStore } from './state.js';
import type { ChatSettings } from './types.js';

export class SettingsManager {
  constructor(
    private api: ApiProxy,
    private state: StateStore,
  ) {}

  async getModels(sessionId: string) {
    const res = await this.api.sessions.models({ sessionId });
    if (!res.ok) throw new Error(`models failed: ${JSON.stringify(res.error)}`);
    return res.value;
  }

  async selectModel(chatId: number, sessionId: string, provider: string, model: string, reasoningEffort?: string): Promise<void> {
    const res = await this.api.sessions.selectModel({
      sessionId,
      provider,
      model,
      ...(reasoningEffort ? { reasoningEffort } : {}),
    });
    if (!res.ok) throw new Error(`selectModel failed: ${JSON.stringify(res.error)}`);
    const settings = this.state.getChatSettings(chatId);
    settings.provider = provider;
    settings.model = model;
    if (reasoningEffort) settings.reasoningEffort = reasoningEffort;
    this.state.setChatSettings(chatId, settings);
  }

  async listPresets() {
    const res = await this.api.agentPresets.list({});
    if (!res.ok) throw new Error(`presets failed: ${JSON.stringify(res.error)}`);
    return res.value.presets;
  }

  async selectPreset(chatId: number, sessionId: string, agentPreset: string): Promise<void> {
    const res = await this.api.agentPresets.select({ sessionId, agentPreset });
    if (!res.ok) {
      const code = (res as any).error?.code;
      if (code === 'agent-preset-locked') {
        throw new Error('当前会话已有历史，请先使用 /new 开始新对话后再切换 preset');
      }
      throw new Error(`selectPreset failed: ${JSON.stringify(res.error)}`);
    }
    const settings = this.state.getChatSettings(chatId);
    settings.agentPreset = agentPreset;
    this.state.setChatSettings(chatId, settings);
  }
}
```

2. Run:

```bash
pnpm typecheck
```

---

## Task 8: Menu and commands

### Files
- `src/menu.ts`
- `src/telegram.ts` (command wiring)

### Why
Provide inline quick actions and `/menu` settings panel.

### Change Necessity
- User-visible need: buttons and settings panel.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `src/menu.ts`:

```ts
import { InlineKeyboard } from 'grammy';

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('新对话', 'new')
    .text('取消', 'cancel')
    .text('状态', 'status')
    .row()
    .text('设置', 'menu');
}

export function settingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('模型', 'models')
    .text('思考强度', 'efforts')
    .text('Agent preset', 'presets')
    .row()
    .text('返回', 'back');
}
```

2. Wire commands in `src/telegram.ts` (full implementation in Task 9).

3. Run:

```bash
pnpm typecheck
```

---

## Task 9: Telegram service

### Files
- `src/telegram.ts`

### Why
Run the bot, enforce owner, handle text/commands/callbacks, and integrate queue/forwarder.

### Change Necessity
- User-visible need: actual Telegram interaction.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `src/telegram.ts`:

```ts
import { Bot, InlineKeyboard } from 'grammy';
import type { Context as CordisContext } from '@deepseek-ai/cordis';
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy';
import type { PluginConfig } from './types.js';
import { StateStore } from './state.js';
import { SessionManager } from './session.js';
import { QueueManager } from './queue.js';
import { EventForwarder } from './forwarder.js';
import { SettingsManager } from './settings.js';

export interface TelegramDeps {
  ctx: CordisContext;
  api: ApiProxy;
  config: PluginConfig;
  state: StateStore;
}

export async function startTelegram(deps: TelegramDeps): Promise<{ stop: () => Promise<void> }> {
  const { ctx, api, config, state } = deps;
  const bot = new Bot(config.botToken);

  const sessions = new SessionManager(api, state, config.projectRoot ?? process.cwd());
  const queue = new QueueManager(api, sessions, state);
  const settings = new SettingsManager(api, state);
  const forwarder = new EventForwarder(ctx, bot, state);
  forwarder.start();

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined || chatId !== config.ownerId) {
      return;
    }
    await next();
  });

  bot.command('start', async (ctx) => {
    await ctx.reply('dsh-telegram-bridge 已启动', { reply_markup: mainMenu() });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply('命令：/new /cancel /status /help /menu /compact');
  });

  bot.command('new', async (ctx) => {
    await ctx.reply('确定要开始新对话吗？回复 /confirm_new 确认。');
  });

  bot.command('confirm_new', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chatSettings = state.getChatSettings(chatId);
    await sessions.resetSession(chatId, chatSettings);
    await ctx.reply('已开始新对话。');
  });

  bot.command('cancel', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = state.getChatState(chatId);
    if (!chat) {
      await ctx.reply('当前没有会话。');
      return;
    }
    queue.clear(chatId);
    const agent = ctx.agents.get(chat.sessionId);
    if (agent) {
      agent.cancel({ kind: 'user' });
    }
    await ctx.reply('已取消当前任务并清空队列。');
  });

  bot.command('status', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = state.getChatState(chatId);
    const settingsForChat = state.getChatSettings(chatId);
    const text = [
      `Session: ${chat?.sessionId ?? 'none'}`,
      `Queue: ${queue.queueLength(chatId)}`,
      `Model: ${settingsForChat.model ?? 'default'}`,
      `Preset: ${settingsForChat.agentPreset ?? 'default'}`,
    ].join('\n');
    await ctx.reply(text);
  });

  bot.command('compact', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = state.getChatState(chatId);
    if (!chat) {
      await ctx.reply('当前没有会话。');
      return;
    }
    const compaction = ctx.get('compaction');
    const agent = ctx.agents.get(chat.sessionId);
    if (compaction && agent) {
      try {
        await compaction.compactNow(agent, new AbortController().signal);
        await ctx.reply('压缩完成。');
        return;
      } catch (error: any) {
        await ctx.reply(`压缩失败：${error?.message ?? String(error)}`);
        return;
      }
    }
    // Fallback: use the built-in /compact command through dsh prompt.
    const res = await api.sessions.prompt({
      sessionId: chat.sessionId,
      mode: 'queue',
      content: [{ type: 'text', text: '/compact' }],
    });
    if (!res.ok) {
      await ctx.reply(`压缩失败：${JSON.stringify(res.error)}`);
      return;
    }
    await ctx.reply('已请求压缩。');
  });

  bot.command('menu', async (ctx) => {
    await ctx.reply('设置面板', { reply_markup: settingsMenu() });
  });

  bot.callbackQuery('new', async (ctx) => {
    await ctx.reply('确定要开始新对话吗？回复 /confirm_new 确认。');
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('cancel', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = state.getChatState(chatId);
    if (chat) {
      queue.clear(chatId);
      const agent = ctx.agents.get(chat.sessionId);
      if (agent) agent.cancel({ kind: 'user' });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('status', async (ctx) => {
    const chatId = ctx.chat!.id;
    const chat = state.getChatState(chatId);
    await ctx.reply(`Session: ${chat?.sessionId ?? 'none'}`);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('menu', async (ctx) => {
    await ctx.editMessageText('设置面板', { reply_markup: settingsMenu() });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('models', async (ctx) => {
    const chatId = ctx.chat!.id;
    const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
    const models = await settings.getModels(sessionId);
    const keyboard = new InlineKeyboard();
    for (const group of models.groups) {
      for (const model of group.models) {
        keyboard.text(`${group.id}/${model.id}`, `model:${group.id}:${model.id}`).row();
      }
    }
    await ctx.editMessageText('选择模型', { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/model:.+/, async (ctx) => {
    const data = ctx.callbackQuery.data;
    const [, provider, model] = data.split(':');
    const chatId = ctx.chat!.id;
    const sessionId = await sessions.ensureSession(chatId, state.getChatSettings(chatId));
    await settings.selectModel(chatId, sessionId, provider, model);
    await ctx.answerCallbackQuery('已切换模型');
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;
    queue.enqueue(ctx.chat.id, text);
    await ctx.reply('已收到，处理中...');
    await ctx.replyWithChatAction('typing');
  });

  await bot.init();
  await bot.start({
    onStart: () => console.log('dsh-telegram-bridge started'),
  });

  return {
    stop: async () => {
      await bot.stop();
    },
  };
}

function mainMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text('新对话', 'new')
    .text('取消', 'cancel')
    .text('状态', 'status')
    .row()
    .text('设置', 'menu');
}

function settingsMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text('模型', 'models')
    .text('思考强度', 'efforts')
    .text('Agent preset', 'presets')
    .row()
    .text('返回', 'back');
}
```

2. Run:

```bash
pnpm typecheck
```

---

## Task 10: dsh plugin entry

### Files
- `src/index.ts`

### Why
Expose the Cordis plugin entry that dsh loads.

### Change Necessity
- User-visible need: dsh can load the plugin.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `src/index.ts`:

```ts
import type { Context } from '@deepseek-ai/cordis';
import { ensureDataDir, loadConfig, writeExampleConfig } from './config.js';
import { StateStore } from './state.js';
import { startTelegram } from './telegram.js';

export const name = 'dsh-telegram-bridge';
export const inject = ['apiProxy', 'agents'];

export function apply(ctx: Context): void {
  const dataDir = process.env.DSH_TELEGRAM_DATA_DIR ?? undefined;
  ensureDataDir(dataDir);
  writeExampleConfig(dataDir);

  let config;
  try {
    config = loadConfig(dataDir);
  } catch (error) {
    ctx.logger.warn(`dsh-telegram-bridge: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const state = new StateStore(config.dataDir ?? dataDir);
  const handle = startTelegram({ ctx, api: ctx.apiProxy, config, state });

  ctx.effect(() => {
    let stopped = false;
    void handle.then(async ({ stop }) => {
      if (stopped) await stop();
    });
    return () => {
      stopped = true;
    };
  });
}
```

2. Run:

```bash
pnpm build
```

---

## Task 11: dsh bundle patch

### Files
- `extensions/dsh/cordis.patch.yml`

### Why
Insert the plugin row into dsh composed profile.

### Change Necessity
- User-visible need: dsh discovers the plugin.
- No-change option: not possible.
- Decision: code-change.

### Steps

1. Create `extensions/dsh/cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-telegram-bridge
      name: dsh-telegram-bridge/lib/index.js
```

2. Run:

```bash
pnpm build
```

---

## Task 12: Local install verification

### Steps

1. From project root, build:

```bash
cd ~/Projects/dsh-telegram-bridge
pnpm build
```

2. Install into web profile:

```bash
dsh plugin --profile web add /home/los/Projects/dsh-telegram-bridge
```

3. Verify composed config:

```bash
dsh --profile web --dump-config | grep -A2 dsh-telegram-bridge
```

Expected output contains:

```yaml
- id: dsh-telegram-bridge
  name: dsh-telegram-bridge/lib/index.js
```

4. Restart `dsh web`.

5. Provide `~/.dsh/dsh-telegram-bridge/config.json` with real bot token and owner id.

6. Manual acceptance per Design Spec section 11.

---

## Risks

- `agentPreset.select` is locked on non-blank sessions; handled by blocking with a clear message.
- `ctx.compaction` may be unavailable in some profiles; fallback is to send `/compact` via `apiProxy.sessions.prompt`.
- Telegram HTML parse can fail; fallback to plain text is implemented.
- Long polling requires dsh process to stay alive; accepted.

## Retirement

- No old implementation exists.
- If a future version replaces this plugin, remove the profile dependency via `dsh plugin --profile web remove dsh-telegram-bridge` and delete `~/.dsh/dsh-telegram-bridge` if no longer needed.
