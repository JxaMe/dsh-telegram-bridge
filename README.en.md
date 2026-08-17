# dsh-telegram-bridge

**English** | [中文](./README.md)

A plugin that bridges Telegram private chats to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) agent sessions. Talk to your dsh agent directly from Telegram: send messages, get replies, switch models and reasoning effort, choose agent presets, and manage context and sessions.

<p align="center">
  <a href="https://github.com/JxaMe/dsh-telegram-bridge/releases"><img alt="Release" src="https://img.shields.io/github/v/release/JxaMe/dsh-telegram-bridge?style=flat-square"></a>
  <a href="https://github.com/JxaMe/dsh-telegram-bridge/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/JxaMe/dsh-telegram-bridge/ci.yml?branch=main&style=flat-square"></a>
  <img alt="License" src="https://img.shields.io/github/license/JxaMe/dsh-telegram-bridge?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square">
</p>

> Current version: **v1.2.0** · Actively maintained

## ✨ Features

### Conversation
- 💬 **Private chat bridge** — one-on-one conversation between Telegram and a dsh session.
- ⏱️ **Live status line** — shows real activity (tool calls / commands); falls back to rotating neutral phrases every 3s during long turns.
- 🧵 **Queue & interrupt** — messages are queued with a limit; `/interrupt` cancels the current task and clears the queue.
- 🔄 **Regenerate** — re-sends the last user message in the same session, preserving context.
- 🔁 **Per-message retry** — every failed message can be retried independently.

### Reply Rendering
- 🎛️ **Structured output** — supports dsh-ui `keyvalue` / `callout` / `list` / `steps` / `table` / `todo` / `section`.
- 📝 **Rich text** — bold, italic, headings, lists, quotes, inline code and links.
- 📐 **Smart splitting** — splits at paragraph/sentence boundaries; code blocks split by line and auto-truncate; structured blocks stay intact.

### Sessions & Settings
- 📂 **Lightweight sessions** — keep the N most recent conversations per chat; switch via `/sessions`; each session keeps its own model / reasoning / preset.
- 🧠 **Model & reasoning controls** — dynamically list and switch models and reasoning effort.
- 🎛️ **Agent preset switching** — blank sessions only.
- 🖥️ **dsh Web UI settings panel** — manage token, owner, proxy, defaults, queue limit, status line, and more.

### Stability
- 🗂️ **Queue persistence** — pending and in-flight messages are written to `queue.json` and recovered on restart (at-least-once).
- 📄 **File logging** — `logs/dsh-telegram-bridge.log`, auto-rotated after 5MB, tokens redacted.
- 💾 **State backup** — `state.json.bak` / `settings.json.bak`, auto-recovered when corrupted.
- 🛡️ **Global guards** — unhandled rejections / exceptions are logged without stopping the plugin when possible.
- 🚀 **Startup self-check** — validates Telegram API and dsh API on boot.
- 🩺 **Health check** — `/health` reports uptime, messages, replies, and errors.
- 🚦 **Rate-limit protection** — Telegram 429 responses are retried after the requested wait.

## 🖥️ Settings Panel

The dsh Web UI settings page includes a dedicated **Telegram Bridge** section for connection, defaults, and behavior options.

![dsh-telegram-bridge settings](./set.png)

## 🔧 How It Works

```text
Telegram Bot API
      │ long polling (grammY)
      ▼
dsh-telegram-bridge (dsh profile plugin)
      │
      ├── dsh apiProxy (sessions, models, presets)
      ├── dsh agents (interrupt)
      └── dsh session events (replies / status)
      │
      ▼
dsh agent session
```

The plugin runs inside a dsh profile (usually `web`) and uses dsh native services — no separate server or webhook required.

## 📦 Requirements

- DeepSeek Harness (`dsh`) installed
- `pnpm` available
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram numeric user ID

## 🚀 Installation

From GitHub:

```bash
dsh plugin --profile web add github:JxaMe/dsh-telegram-bridge
```

Local development:

```bash
cd ~/Projects/dsh-telegram-bridge
pnpm install
pnpm build
dsh plugin --profile web add /home/los/Projects/dsh-telegram-bridge
```

Verify:

```bash
dsh --profile web --dump-config | grep dsh-telegram-bridge
```

Then restart `dsh web`.

## ⚙️ Configuration

`~/.dsh/dsh-telegram-bridge/config.json` (generated on first start):

```json
{
  "botToken": "123456:ABC-YOUR-REAL-BOT-TOKEN",
  "ownerId": 123456789,
  "projectRoot": "/home/you"
}
```

| Field | Description | Default |
| --- | --- | --- |
| `botToken` | Telegram bot token | — |
| `ownerId` | Allowed Telegram user ID | — |
| `projectRoot` | Working directory for new sessions | `process.cwd()` |
| `proxyEnabled` / `proxyUrl` | Proxy switch and URL | `false` / `http://127.0.0.1:7890` |
| `defaultProvider` / `defaultModel` / `defaultReasoningEffort` | Default model settings | `''` |
| `defaultAgentPreset` | Default agent preset | `''` |
| `errorDisplayMode` | `raw` or `friendly` | `raw` |
| `htmlFormatting` | Telegram HTML formatting | `true` |
| `typingIndicator` | Typing indicator | `true` |
| `statusLine` | Live status line | `true` |
| `queueLimit` | Max queued messages per chat | `20` |
| `maxSessionsPerChat` | Recent sessions kept per chat | `5` |
| `debugLogging` | Debug logging | `false` |

## 📟 Commands

| Command | Description |
| --- | --- |
| `/start` | Show main menu |
| `/new` | Start a new conversation (needs confirmation) |
| `/interrupt` | Interrupt the current task and clear the queue (`/cancel` alias) |
| `/status` | Session, queue, model, token & runtime stats |
| `/health` | Uptime, messages, replies, errors |
| `/sessions` | View and switch recent sessions |
| `/menu` | Open settings panel |
| `/compact` | Compact context |
| `/commands` | Open the in-chat command menu |
| `/version` | Current version & updates |
| `/help` | Command help |

## 🧪 Development

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

TypeScript strict mode is used. After editing `src/`, run `pnpm build` to regenerate `lib/`, then restart `dsh web`.

## 🛣️ Roadmap

- [x] V1 conversation bridge (messages, queue, cancel, compact, persistence)
- [x] V2 full dsh Web UI settings panel
- [x] UX polish (status line, rich rendering, quick actions, sessions)
- [x] Stability (logging, backup, queue persistence, self-check, rate limits, health)

## 📄 License

[MIT](./LICENSE)
