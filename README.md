# dsh-telegram-bridge

[English](./README.en.md) | **中文**

将 Telegram 私聊与 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）Agent 会话连接起来的桥接插件。在 Telegram 里直接和你的 dsh Agent 对话：发送消息、接收回复、切换模型与思考强度、选择 Agent preset、管理上下文与多会话。

<p align="center">
  <a href="https://github.com/JxaMe/dsh-telegram-bridge/releases"><img alt="Release" src="https://img.shields.io/github/v/release/JxaMe/dsh-telegram-bridge?style=flat-square"></a>
  <a href="https://github.com/JxaMe/dsh-telegram-bridge/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/JxaMe/dsh-telegram-bridge/ci.yml?branch=main&style=flat-square"></a>
  <img alt="License" src="https://img.shields.io/github/license/JxaMe/dsh-telegram-bridge?style=flat-square">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square">
</p>

> 当前版本：**v1.2.0** · 本项目持续更新中

## ✨ 特性

### 对话体验
- 💬 **私聊桥接**：Telegram 与 dsh Agent 会话一对一对话。
- ⏱️ **实时状态行**：显示真实活动（正在调用工具 / 正在执行命令），无真实信息时每 3 秒轮换中性文案；长任务不再“看起来像断连”。
- 🧵 **队列与打断**：消息顺序排队，带队列上限；`/interrupt` 打断当前任务并清空队列。
- 🔄 **重新生成**：在保留上下文的前提下，用同一 session 重发最后一条用户消息。
- 🔁 **独立失败重试**：每条失败消息都可单独回翻重试。

### 回复呈现
- 🎛️ **结构化渲染**：支持 dsh-ui 的 `keyvalue` / `callout` / `list` / `steps` / `table` / `todo` / `section`。
- 📝 **富文本**：加粗、斜体、标题、列表、引用、行内代码与链接。
- 📐 **智能切分**：长消息按段落/句子边界分段；代码块按行切分并自动截断；结构化内容保持完整。

### 会话与设置
- 📂 **轻量多会话**：每个聊天保留最近 N 个会话，`/sessions` 一键切换；每个会话独立保存模型/思考强度/Preset。
- 🧠 **模型与思考强度控制**：动态列出并切换模型、推理强度。
- 🎛️ **Agent preset 切换**：仅限空白会话。
- 🖥️ **dsh Web UI 设置面板**：管理 Token、Owner、代理、默认模型/Preset、队列上限、状态行开关等。

### 稳定性
- 🗂️ **队列持久化**：排队消息（含正在处理的消息）写入 `queue.json`，重启后自动恢复（at-least-once）。
- 📄 **文件日志**：`logs/dsh-telegram-bridge.log`，超过 5MB 自动轮转；Token 自动脱敏。
- 💾 **状态备份**：`state.json.bak` / `settings.json.bak`，损坏时自动回退恢复。
- 🛡️ **全局兜底**：未捕获 rejection / 异常写入日志并尽量不中断运行。
- 🚀 **启动自检**：启动时检查 Telegram API 与 dsh API。
- 🩺 **健康检查**：`/health` 查看运行时长、消息数、回复数、错误数。
- 🚦 **限流保护**：Telegram 429 自动按 `retry_after` 等待后重试。

## 🖥️ 设置面板

dsh Web UI 设置页提供 **Telegram Bridge** 独立分区，可在页面中管理连接、默认模型/Preset 与行为选项。

![dsh-telegram-bridge settings](./set.png)

## 🔧 工作原理

```text
Telegram Bot API
      │ 长轮询（grammY）
      ▼
dsh-telegram-bridge（dsh profile 插件）
      │
      ├── dsh apiProxy（session、模型、preset）
      ├── dsh agents（取消任务）
      └── dsh session 事件（Agent 回复 / 状态）
      │
      ▼
dsh Agent 会话
```

插件运行在 dsh profile 内部（通常是 `web`），直接使用 dsh 原生服务，无需独立服务器或 Webhook。

## 📦 环境要求

- 已安装 DeepSeek Harness（`dsh`）
- 已安装 `pnpm`
- Telegram Bot Token（来自 [@BotFather](https://t.me/BotFather)）
- 你的 Telegram 数字 User ID

## 🚀 安装

从 GitHub 安装：

```bash
dsh plugin --profile web add github:JxaMe/dsh-telegram-bridge
```

本地开发安装：

```bash
cd ~/Projects/dsh-telegram-bridge
pnpm install
pnpm build
dsh plugin --profile web add /home/los/Projects/dsh-telegram-bridge
```

验证注册：

```bash
dsh --profile web --dump-config | grep dsh-telegram-bridge
```

然后重启 `dsh web`。

## ⚙️ 配置

配置文件位于 `~/.dsh/dsh-telegram-bridge/config.json`（首次启动自动生成示例）：

```json
{
  "botToken": "123456:ABC-YOUR-REAL-BOT-TOKEN",
  "ownerId": 123456789,
  "projectRoot": "/home/you"
}
```

| 字段 | 说明 | 默认 |
| --- | --- | --- |
| `botToken` | Telegram Bot Token | — |
| `ownerId` | 允许使用的 Telegram 用户 ID | — |
| `projectRoot` | 新会话工作目录 | `process.cwd()` |
| `proxyEnabled` / `proxyUrl` | 代理开关与地址 | `false` / `http://127.0.0.1:7890` |
| `defaultProvider` / `defaultModel` / `defaultReasoningEffort` | 默认模型设置 | `''` |
| `defaultAgentPreset` | 默认 Agent preset | `''` |
| `errorDisplayMode` | 错误显示：`raw` / `friendly` | `raw` |
| `htmlFormatting` | Telegram HTML 格式化 | `true` |
| `typingIndicator` | 打字指示器 | `true` |
| `statusLine` | 实时状态行 | `true` |
| `queueLimit` | 每个聊天最多排队消息数 | `20` |
| `maxSessionsPerChat` | 保留的最近会话数 | `5` |
| `debugLogging` | 调试日志 | `false` |

## 📟 命令

| 命令 | 说明 |
| --- | --- |
| `/start` | 显示主菜单 |
| `/new` | 开始新对话（需确认） |
| `/interrupt` | 打断当前任务并清空队列（`/cancel` 同义） |
| `/status` | 查看会话、队列、模型、Token 与运行统计 |
| `/health` | 查看运行时长、消息/回复/错误计数 |
| `/sessions` | 查看和切换最近会话 |
| `/menu` | 打开设置面板 |
| `/compact` | 压缩上下文 |
| `/commands` | 打开聊天内命令菜单 |
| `/version` | 查看当前版本与更新 |
| `/help` | 显示命令帮助 |

## 🧱 项目结构

```text
dsh-telegram-bridge/
├── src/
│   ├── index.ts           # dsh 插件入口 + 全局兜底
│   ├── telegram.ts        # Telegram bot、命令、按钮
│   ├── session.ts         # 多会话管理
│   ├── queue.ts           # 消息队列 + 持久化
│   ├── forwarder.ts       # 事件转发、格式化、切分
│   ├── pending-status.ts  # 实时状态行
│   ├── state.ts           # 状态持久化 + 备份恢复
│   ├── config.ts          # 配置加载
│   ├── logger.ts          # 文件日志 + 轮转
│   ├── metrics.ts         # 运行指标
│   └── ...
├── client/                # dsh Web UI 设置面板
├── test/                  # 单元测试
├── docs/aegis/            # Aegis 设计与计划文档
└── .github/workflows/     # CI / Release 自动化
```

## 🧪 开发

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

项目使用 TypeScript 严格模式。修改源码后需 `pnpm build`（生成 `lib/`），再重启 `dsh web` 生效。

## 🛣️ Roadmap

- [x] V1 对话桥接（消息、队列、取消、压缩、状态持久化）
- [x] V2 dsh Web UI 全量设置面板
- [x] UX 打磨（实时状态行、富文本、快捷操作、多会话）
- [x] 稳定性（日志、备份、队列持久化、自检、限流、健康检查）

## 📄 License

[MIT](./LICENSE)
