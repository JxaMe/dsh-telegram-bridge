# dsh-telegram-bridge

[English](./README.en.md) | **中文**

将 Telegram 私聊与 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）Agent 会话连接起来的桥接插件。

直接在 Telegram 里和你的 dsh Agent 对话：发送消息、接收回复、切换模型、调整思考强度、选择 Agent preset、管理上下文——全部在私聊中完成。

> 本项目持续更新中..

## 功能特性

- 💬 **私聊桥接**：Telegram 与 dsh Agent 会话的一对一对话。
- 🧠 **模型与思考强度控制**：动态列出并切换模型和思考强度。
- 🎛️ **Agent preset 切换**：选择可用的 dsh preset（仅限空白会话）。
- 📋 **内联命令菜单**：新对话、打断、状态、设置等快捷按钮；也提供聊天内命令菜单 `/commands` 作为原生菜单不可见时的兜底。
- ⏳ **等待提示**：Agent 思考时显示 `🐋 Deep diving...`，并带心跳更新和多消息排队等待。
- 🧵 **队列与打断**：消息按顺序排队，带队列上限；`/interrupt` 打断当前任务并清空队列（`/cancel` 仍可用）。
- 🗜️ **上下文压缩**：`/compact` 压缩过长的对话历史。
- 🧹 **安全消息格式**：HTML 转义、代码块识别、按代码块边界分段发送。
- 📊 **增强状态**：`/status` 显示忙碌状态、provider/model、消息数与 token 统计、preset 锁定状态。
- ♻️ **状态持久化**：chat → session 映射和用户设置会在 dsh 重启后保留。
- 🌐 **代理支持**：自动使用 `HTTPS_PROXY` / `HTTP_PROXY`。
- 🛡️ **仅限 Owner**：只有配置的 Telegram 用户 ID 可以使用。

## 工作原理

```text
Telegram Bot API
      │ 长轮询（grammY）
      ▼
dsh-telegram-bridge（dsh profile 插件）
      │
      ├── dsh apiProxy（session、模型、preset）
      ├── dsh agents（取消任务）
      └── dsh session 事件（Agent 回复）
      │
      ▼
dsh Agent 会话
```

插件运行在 dsh profile 内部（通常是 `web`），直接使用 dsh 原生服务，不需要独立服务器或 Webhook。

## 环境要求

- 已安装 DeepSeek Harness（`dsh`）
- 已安装 `pnpm`（dsh 插件管理器依赖）
- 来自 [@BotFather](https://t.me/BotFather) 的 Telegram Bot Token
- 你的 Telegram 数字 User ID（可通过 [@userinfobot](https://t.me/userinfobot) 查询）

## 安装

可以通过以下命令安装：

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

验证插件是否注册成功：

```bash
dsh --profile web --dump-config | grep dsh-telegram-bridge
```

然后重启 `dsh web`。

## 配置

创建或编辑 `~/.dsh/dsh-telegram-bridge/config.json`：

```json
{
  "botToken": "123456:ABC-YOUR-REAL-BOT-TOKEN",
  "ownerId": 123456789,
  "projectRoot": "/home/you"
}
```

| 字段 | 说明 |
|---|---|
| `botToken` | 来自 @BotFather 的 Telegram Bot Token |
| `ownerId` | 你的 Telegram 数字 User ID |
| `projectRoot` | 新 dsh session 使用的工作目录 |

> 插件首次启动时会自动生成示例配置文件。

## 使用方法

打开与 bot 的私聊，发送 `/start`。

### 命令

| 命令 | 说明 |
|---|---|
| `/start` | 显示主菜单 |
| `/new` | 开始新对话（需要确认） |
| `/interrupt` | 打断当前任务并清空队列（`/cancel` 仍可用） |
| `/status` | 查看 session、队列、模型和 preset 状态 |
| `/menu` | 打开设置面板 |
| `/compact` | 压缩对话历史 |
| `/help` | 显示命令帮助 |
| `/commands` | 打开聊天内命令菜单 |

### 设置面板

使用 `/menu` 可以：

- 切换**模型**
- 切换**思考强度**
- 切换 **Agent preset**（仅限空白/新会话）

## 开发

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
```

### 项目结构

```text
dsh-telegram-bridge/
├── src/
│   ├── index.ts          # dsh 插件入口
│   ├── telegram.ts       # Telegram bot 与处理器
│   ├── session.ts        # dsh session 管理
│   ├── queue.ts          # 消息队列
│   ├── forwarder.ts      # Agent 回复转发
│   ├── settings.ts       # 模型/思考强度/preset 设置
│   ├── state.ts          # 持久化状态
│   ├── config.ts         # 配置加载
│   ├── proxy-fetch.ts    # Telegram API 代理支持
│   ├── callback.ts       # Telegram 回调数据编解码
│   ├── security.ts       # 日志脱敏
│   └── ...
├── extensions/dsh/       # dsh bundle patch
└── docs/aegis/           # Aegis 设计与计划文档
```

## Roadmap

- [ ] V2：在 dsh Web UI 中增加完整设置面板

## License

[MIT](./LICENSE)
