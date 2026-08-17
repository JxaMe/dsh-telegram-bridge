# dsh-telegram-bridge

**English** | [中文](./README.md)

A plugin that bridges Telegram private chats to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) agent sessions.

Talk to your dsh agent directly from Telegram: send a message, get a reply, switch models, adjust reasoning effort, select an agent preset, and manage context — all from a private chat.

> **Current version: v1.1.2** · This project is continuously updated.

## Features

- 💬 **Private chat bridge** — one-on-one conversation between Telegram and a dsh agent session.
- 🧠 **Model & reasoning controls** — dynamically list and switch models and reasoning efforts.
- 🎛️ **Agent preset switching** — choose from available dsh presets (blank sessions only).
- 📋 **Inline command menus** — quick buttons for new chat, interrupt, status, settings, and sessions, plus an in-chat `/commands` fallback.
- 🔄 **Quick actions** — final replies include regenerate, interrupt, new chat, and menu buttons; every failed message can be retried independently.
- 📂 **Lightweight sessions** — each chat keeps recent sessions and can switch via `/sessions`; each session keeps its own model/preset settings.
- ⏳ **Live status line** — shows thinking, tool calls, step progress, and elapsed time in a single editable status message.
- 🧵 **Queue & cancel** — messages are queued with a size limit; `/interrupt` stops the current task and clears the queue (`/cancel` still works).
- 🗜️ **Context compaction** — `/compact` reduces conversation history when it gets long.
- 🧹 **Safe message formatting** — HTML escaping, fenced code blocks, logical boundary splitting, and long code truncation.
- 📊 **Enhanced status** — `/status` shows busy state, provider/model, message/token stats, and preset lock state.
- 🩺 **Health check** — `/health` reports uptime, messages, replies, and errors.
- ♻️ **Persistent state** — chat → session mapping and user settings survive dsh restarts.
- 🌐 **Proxy support** — automatically uses `HTTPS_PROXY` / `HTTP_PROXY` when available.
- 🛡️ **Owner-only** — only the configured Telegram user ID can use the bot.
- 🖥️ **dsh Web UI settings panel** — manage Bot Token, Owner, proxy, default model/preset, queue limit, and more; default model and reasoning effort are loaded dynamically from dsh.

## Settings Panel

The dsh Web UI settings page includes a dedicated **Telegram Bridge** section for managing connection, default model/preset, and behavior options.

![dsh-telegram-bridge settings](./set.png)

## How It Works

```text
Telegram Bot API
      │ long polling (grammY)
      ▼
dsh-telegram-bridge (dsh profile plugin)
      │
      ├── dsh apiProxy (sessions, models, presets)
      ├── dsh agents (interrupt)
      └── dsh session events (assistant replies)
      │
      ▼
dsh agent session
```

The plugin runs inside a dsh profile (typically `web`) and uses dsh's native services — no separate server or webhook required.

## Requirements

- DeepSeek Harness (`dsh`) installed
- `pnpm` available (used by the dsh plugin manager)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Your Telegram user ID (e.g. from [@userinfobot](https://t.me/userinfobot))

## Installation

Install from GitHub:

```bash
dsh plugin --profile web add github:JxaMe/dsh-telegram-bridge
```

For local development:

```bash
cd ~/Projects/dsh-telegram-bridge
pnpm install
pnpm build
dsh plugin --profile web add /home/los/Projects/dsh-telegram-bridge
```

Verify the plugin is registered:

```bash
dsh --profile web --dump-config | grep dsh-telegram-bridge
```

Then restart `dsh web`.

## Stability

- **Log file**: `~/.dsh/dsh-telegram-bridge/logs/dsh-telegram-bridge.log`
- **State backup**: `state.json.bak` / `settings.json.bak`, auto-recovered when the main file is corrupted
- **Global guards**: unhandled rejections / exceptions are logged and kept from stopping the plugin when possible
- **Startup self-check**: verifies Telegram API (`getMe`) and dsh API (`agentPresets.list`) on boot
- **Status line keepalive**: long tasks rotate status text every 3s and show tool names during tool calls
- **Queue persistence**: queued messages are written to `queue.json` and resumed after a dsh restart

## Configuration


Create/edit `~/.dsh/dsh-telegram-bridge/config.json`:

```json
{
  "botToken": "123456:ABC-YOUR-REAL-BOT-TOKEN",
  "ownerId": 123456789,
  "projectRoot": "/home/you"
}
```

| Field | Description |
|---|---|
| `botToken` | Telegram bot token from @BotFather |
| `ownerId` | Your Telegram numeric user ID |
| `projectRoot` | Working directory used for new dsh sessions |

> The plugin creates an example config file automatically on first start.

## Usage

Open a private chat with your bot and send `/start`.

### Commands

| Command | Description |
|---|---|
| `/start` | Show the main menu |
| `/new` | Start a new conversation (requires confirmation) |
| `/interrupt` | Interrupt the current task and clear the queue (`/cancel` still works) |
| `/status` | Show session, queue, model, and preset status |
| `/menu` | Open the settings panel |
| `/sessions` | View and switch recent sessions |
| `/compact` | Compact conversation history |
| `/version` | Show current version and updates |
| `/help` | Show command help |
| `/commands` | Open the in-chat command menu |

### Settings Panel

Use `/menu` to:

- Switch **model**
- Switch **reasoning effort**
- Switch **Agent preset** (only available on blank/new sessions)

## Development

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

### Project Structure

```text
dsh-telegram-bridge/
├── src/
│   ├── index.ts          # dsh plugin entry
│   ├── telegram.ts       # Telegram bot & handlers
│   ├── session.ts        # dsh session management
│   ├── queue.ts          # message queue
│   ├── forwarder.ts      # assistant reply forwarding
│   ├── settings.ts       # model/effort/preset settings
│   ├── state.ts          # persistent state
│   ├── config.ts         # configuration loading
│   ├── proxy-fetch.ts    # Telegram API proxy support
│   ├── callback.ts       # Telegram callback data codec
│   ├── security.ts       # log redaction
│   └── ...
├── extensions/dsh/       # dsh bundle patch
└── README.md
```

## Roadmap

- [x] V2: Full settings panel in the dsh Web UI (initial version shipped)

## License

[MIT](./LICENSE)
