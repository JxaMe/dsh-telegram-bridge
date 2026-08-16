# dsh-telegram-bridge Design Spec

Date: 2026-08-17
Status: Draft for user review
Owner: dsh-telegram-bridge

## 1. Purpose

Build a DeepSeek Harness (`dsh`) profile plugin that bridges a Telegram private chat to a dsh agent session. The user talks to a Telegram bot; the bot forwards text messages to a dedicated dsh session and streams the agent's replies back to Telegram.

## 2. Goals

- Provide single-owner, private-chat, bidirectional text conversation with dsh.
- Use dsh native profile-plugin installation (`dsh plugin --profile <profile> add`).
- Support commands: `/new`, `/cancel`, `/help`, `/status`, `/menu`, `/compact`.
- Provide inline quick-action buttons plus a full `/menu` settings panel.
- Support dynamic model selection, reasoning-effort selection, and Agent preset selection within dsh constraints.
- Persist chat → session mapping and user settings across dsh restarts.
- Provide typing indicator, Markdown/HTML rendering with plain-text fallback, and long-message splitting.
- Automatically reconnect Telegram long polling and recover after dsh restart.

## 3. Non-Goals

- No group chat support.
- No multi-user/owner system.
- No image/file/voice/media input in V1.
- No proactive/agent-initiated Telegram push in V1.
- No persistent message queue across dsh restarts.
- No project context file management (`CONTEXT.md` / `CONTEXT-MAP.md`) in V1.
- No replacement of dsh's own Web UI or skill system.

## 4. Architecture

### 4.1 Chosen Approach

Single dsh profile plugin using Telegram long polling inside the dsh process.

```text
Telegram Bot API
      │ long polling
      ▼
dsh-telegram-bridge (plugin inside dsh web profile)
      │
      ├── ctx.apiProxy.sessions.*
      ├── ctx.agents / ctx.compaction
      └── ctx.on('session/event')
      │
      ▼
dsh agent session
```

### 4.2 Plugin Packaging

- Package name: `dsh-telegram-bridge`
- Project root: `~/Projects/dsh-telegram-bridge`
- Language: TypeScript
- Runtime: Node.js (dsh host)
- Distribution: dsh profile plugin bundle
  - `package.json` with `dsh.bundle.patch`
  - `extensions/dsh/index.js` as the Cordis plugin entry
  - `cordis.patch.yml` or `extensions/dsh/cordis.patch.yml` for profile insertion

### 4.3 Runtime Dependencies

- `grammy` (Telegram Bot framework)
- `@deepseek-ai/cordis` (peer, provided by dsh)
- dsh services accessed through `ctx`:
  - `apiProxy`
  - `agents`
  - `compaction` (optional, with fallback to `/compact` command)

## 5. Components

### 5.1 TelegramBotService

- Long-polling bot using `grammy`.
- Owner-only gate: only `config.ownerId` may interact.
- Handles:
  - plain text messages
  - slash commands
  - inline keyboard callbacks
- Sends:
  - typing actions (`sendChatAction`)
  - split long messages (Telegram 4096 char limit)
  - Markdown/HTML parse with plain-text fallback

### 5.2 SessionManager

- Maintains `chatId -> dshSessionId` mapping.
- Creates a dsh session on first message via `apiProxy.sessions.create`.
- Resumes existing session on later messages via `apiProxy.sessions.prompt`.
- Persists mapping in `~/.dsh/dsh-telegram-bridge/state.json`.
- On dsh restart, restores mapping; if the stored session no longer exists, creates a new session and updates the mapping.

### 5.3 QueueManager

- In-memory FIFO queue per chat.
- Serializes prompt submission to dsh.
- On `/cancel`:
  - calls `agent.cancel({ kind: 'user' })` (default clears dsh inbox)
  - clears local queue
- Queue is not persisted.

### 5.4 EventForwarder

- Subscribes to `ctx.on('session/event', ...)`.
- Filters events for mapped sessions.
- On `assistant/message`, extracts text content and sends to the corresponding Telegram chat.
- Handles formatting, splitting, and error forwarding.

### 5.5 SettingsManager

- Reads current model/reasoning options from `apiProxy.sessions.models`.
- Reads available Agent presets from `apiProxy.agentPresets.list`.
- Applies:
  - model + reasoning effort via `apiProxy.sessions.selectModel`
  - Agent preset via `apiProxy.agentPresets.select` (blank sessions only)
- Persists chosen settings in `~/.dsh/dsh-telegram-bridge/settings.json`.

### 5.6 CommandHandler

| Command | Behavior |
|---|---|
| `/new` | Asks for confirmation, then creates a new dsh session and updates chat mapping. |
| `/cancel` | Cancels current dsh turn and clears the queue. |
| `/status` | Shows session id, running state, queue length, current model, reasoning effort, preset. |
| `/help` | Lists available commands. |
| `/menu` | Opens inline settings panel. |
| `/compact` | Triggers dsh context compaction. |

## 6. Data Model

### 6.1 `state.json`

```json
{
  "chats": {
    "<telegramChatId>": {
      "sessionId": "<dshSessionId>",
      "createdAt": 0
    }
  }
}
```

### 6.2 `settings.json`

```json
{
  "chats": {
    "<telegramChatId>": {
      "provider": "openai",
      "model": "gpt-5.6-sol",
      "reasoningEffort": "xhigh",
      "agentPreset": "standard"
    }
  }
}
```

## 7. dsh API Integration

| Capability | dsh API |
|---|---|
| Send/queue user text | `apiProxy.sessions.prompt({ sessionId, mode: 'queue', content })` |
| Create session | `apiProxy.sessions.create({ cwd, agentPreset? })` |
| List models / efforts | `apiProxy.sessions.models({ sessionId })` |
| Select model / effort | `apiProxy.sessions.selectModel({ sessionId, provider, model, reasoningEffort? })` |
| List presets | `apiProxy.agentPresets.list({})` |
| Select preset | `apiProxy.agentPresets.select({ sessionId, agentPreset })` |
| Cancel + clear inbox | `agent.cancel({ kind: 'user' })` |
| Compact | `ctx.compaction.compactNow(agent, signal)` or send `/compact` via prompt |
| Receive assistant replies | `ctx.on('session/event', ...)` |

## 8. Key Flows

### 8.1 Normal Message

1. Telegram text arrives.
2. Owner check passes.
3. Queue the message.
4. Reply `已收到，处理中...` and start typing.
5. Resolve/create dsh session.
6. Call `apiProxy.sessions.prompt` with `mode: 'queue'`.
7. On `assistant/message`, format and send reply to Telegram.
8. On error, send raw error to Telegram.

### 8.2 `/new`

1. User sends `/new`.
2. Bot asks `确定要开始新对话吗？回复 y 确认` or uses inline confirm button.
3. On confirm, create new dsh session.
4. Update chat mapping.
5. Reply success.

### 8.3 `/cancel`

1. User sends `/cancel`.
2. If no active work, reply `当前没有正在执行的任务`.
3. Otherwise call `agent.cancel({ kind: 'user' })`.
4. Clear local queue.
5. Reply `已取消当前任务并清空队列`.

### 8.4 `/menu`

1. Show inline keyboard with sections:
   - 模型
   - 思考强度
   - Agent preset
   - 上下文
2. Model/effort lists are fetched dynamically.
3. Preset switching is only enabled when the current session is blank; otherwise show `请先 /new 再切换 preset`.

## 9. Error Handling & Reliability

- Telegram long polling uses automatic reconnection with backoff.
- If dsh session is missing/invalid, create a new session automatically.
- If Telegram send fails due to invalid parse mode, retry as plain text.
- If agent errors, forward the raw error to Telegram.
- If dsh restarts, plugin starts with dsh and restores mappings/settings from disk.
- Queue is intentionally not persisted.

## 10. Security

- Only `config.ownerId` can use the bot.
- Bot token and owner id are stored in plugin config (plain text, per user decision).
- No group support reduces abuse surface.
- Plugin should not expose dsh paths or credentials beyond the owner's own chat.

## 11. Acceptance Criteria

1. Owner can send text in Telegram private chat and receive dsh agent replies.
2. Typing indicator and `已收到` appear during processing.
3. Long replies are split correctly; Markdown/HTML rendering falls back to plain text on failure.
4. `/new` requires confirmation and starts a fresh session.
5. `/cancel` cancels current work and clears the queue.
6. `/status` shows useful session/queue/model/preset info.
7. `/menu` can switch model and reasoning effort dynamically.
8. Agent preset switching works on blank sessions and is blocked with a clear message on active sessions.
9. `/compact` compresses context successfully.
10. dsh restart restores chat → session mapping and user settings.
11. Telegram long polling reconnects automatically after temporary failures.

## 12. Open Questions / Assumptions

- Exact Telegram Bot Token and owner Telegram User ID will be provided before deployment.
- `grammy` is the chosen Telegram framework unless user objects.
- Plugin will be installed into `web` profile first; code remains profile-agnostic.
- `headless` profile is not a target because it is not a long-running host.

## 13. ADR Signals

- New host adapter surface: dsh profile plugin bundle.
- New persistent state files under `~/.dsh/dsh-telegram-bridge/`.
- Dependency direction: plugin depends on dsh public services (`apiProxy`, `agents`, `compaction`), not on dsh internals.
