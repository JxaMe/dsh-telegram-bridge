# dsh-telegram-bridge

**English** | [中文](./README.md)

A plugin that bridges Telegram private chats to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) agent sessions.

Talk to your dsh agent directly from Telegram: send a message, get a reply, switch models, adjust reasoning effort, select an agent preset, and manage context — all from a private chat.

> This project is continuously updated.

## Features

- 💬 **Private chat bridge** — one-on-one conversation between Telegram and a dsh agent session.
- 🧠 **Model & reasoning controls** — dynamically list and switch models and reasoning efforts.
- 🎛️ **Agent preset switching** — choose from available dsh presets (blank sessions only).
- 📋 **Inline command menu** — quick buttons for new chat, cancel, status, and settings.
- ⏳ **Waiting indicator** — shows `🐋 Deep diving...` while the agent is thinking.
- 🧵 **Queue & cancel** — messages are queued; `/cancel` stops the current task and clears the queue.
- 🗜️ **Context compaction** — `/compact` reduces conversation history when it gets long.
- ♻️ **Persistent state** — chat → session mapping and user settings survive dsh restarts.
- 🌐 **Proxy support** — automatically uses `HTTPS_PROXY` / `HTTP_PROXY` when available.
- 🛡️ **Owner-only** — only the configured Telegram user ID can use the bot.

## How It Works

```text
Telegram Bot API
      │ long polling (grammY)
      ▼
dsh-telegram-bridge (dsh profile plugin)
      │
      ├── dsh apiProxy (sessions, models, presets)
      ├── dsh agents (cancel)
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
| `/cancel` | Cancel the current task and clear the queue |
| `/status` | Show session, queue, model, and preset status |
| `/menu` | Open the settings panel |
| `/compact` | Compact conversation history |
| `/help` | Show command help |

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
│   └── ...
├── extensions/dsh/       # dsh bundle patch
└── README.md
```

## Roadmap

- [ ] V2: Full settings panel in the dsh Web UI
- [ ] Better message formatting (safe HTML / code blocks)
- [ ] Queue limits and per-message waiting indicators
- [ ] Automated tests

## License

[MIT](./LICENSE)
