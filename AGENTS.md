# AGENTS.md — dsh-telegram-bridge

本文件为 AI 代理和人类贡献者提供本仓库的工作指引。

## 项目简介

`dsh-telegram-bridge` 是一个 DeepSeek Harness（`dsh`）profile 插件，用于将 Telegram 私聊与 dsh Agent 会话桥接起来。用户可以在 Telegram 中直接与 dsh Agent 对话，并切换模型、思考强度和 Agent preset。

## 技术栈

- TypeScript
- Node.js（dsh 宿主环境）
- grammY（Telegram Bot 框架）
- undici（代理请求）
- dsh 原生服务：`apiProxy`、`agents`、`compaction`、`session/event`

## 快速开始

```bash
pnpm install
pnpm typecheck
pnpm build
```

本地安装到 dsh web profile：

```bash
dsh plugin --profile web add /home/los/Projects/dsh-telegram-bridge
```

重启 `dsh web` 后生效。

## 目录结构

```text
dsh-telegram-bridge/
├── src/
│   ├── index.ts          # dsh 插件入口（apply）
│   ├── telegram.ts       # Telegram bot、命令、回调、菜单
│   ├── session.ts        # dsh session 创建/恢复/重置
│   ├── queue.ts          # 消息队列与取消
│   ├── forwarder.ts      # 监听 assistant/message 并转发到 Telegram
│   ├── settings.ts       # 模型/思考强度/preset 设置
│   ├── state.ts          # 持久化状态（内存缓存 + 原子写）
│   ├── config.ts         # 配置加载
│   ├── proxy-fetch.ts    # Telegram API 代理支持
│   ├── pending-status.ts # Deep diving 等待状态与心跳
│   ├── rpc.ts            # dsh RPC id 生成
│   ├── menu.ts           # Telegram 内联菜单键盘
│   ├── dsh-types.ts      # 本地 dsh API 类型声明
│   └── types.ts          # 领域类型
├── extensions/dsh/
│   └── cordis.patch.yml  # dsh bundle patch
├── docs/aegis/           # Aegis 设计与计划文档
├── README.md
└── AGENTS.md
```

## 架构与数据流

```text
Telegram Bot API
      │ 长轮询（grammY）
      ▼
src/telegram.ts
      │
      ├── 文本消息 → QueueManager → apiProxy.sessions.prompt
      ├── 命令/菜单 → 对应 handler
      └── EventForwarder ← session/event
      │
      ▼
dsh Agent 会话
```

关键点：

- 所有 dsh API 调用必须使用 `{ rpcId, payload }` 格式，并解包 `res.result`。
- `assistant/message` 的正文在 `event.data.message.content`，不是 `event.data.content`。
- 插件运行在 dsh 进程内，Telegram 长轮询通过 `bot.start()` 启动，不能 `await` 它。
- Telegram API 请求需要走代理时使用 `createProxiedFetch`。

## 配置

配置文件位于 `~/.dsh/dsh-telegram-bridge/config.json`：

```json
{
  "botToken": "123456:ABC",
  "ownerId": 123456789,
  "projectRoot": "/home/you"
}
```

- `botToken`：Telegram Bot Token
- `ownerId`：允许使用 bot 的 Telegram 用户 ID
- `projectRoot`：新 dsh session 的工作目录

## 开发规范

- 使用 TypeScript 严格模式。
- 不直接修改 `lib/` 下的生成文件，先改 `src/` 再 `pnpm build`。
- 不手动运行 `codegraph sync`，它会自动同步。
- 修改 dsh API 调用时，注意 RPC 请求格式和返回解包。
- 新增 Telegram 交互时，优先复用现有 `menu.ts` / `pending-status.ts` 等模块。
- 错误处理应避免让 grammy bot 停止：使用 `bot.catch` 和局部 try/catch。

## 测试

当前没有自动化测试。后续计划为以下模块补单测：

- `StateStore`
- `QueueManager`
- `EventForwarder`（文本提取、dsh-ui 渲染）
- Telegram 回调数据编解码

## 当前打磨清单

> 每完成一项，从本清单删除。

### 中优先级

- [ ] 4. 队列增强：加队列上限；多个消息排队时保留等待提示直到队列清空。
- [ ] 5. `/status` 信息增强：显示忙碌状态、provider、reasoning effort、消息数/token、preset 锁定状态。
- [ ] 6. 菜单体验：模型列表分页；显示当前已选值；思考强度按当前模型展示。
- [ ] 7. 消息格式：转义 HTML、识别代码块、按代码块边界分段。
- [ ] 8. 原生命令菜单不可见兜底：增加聊天内持久命令菜单。

### 低优先级

- [ ] 9. 自动化测试：为 StateStore、QueueManager、EventForwarder、回调编解码补单测。
- [ ] 10. 类型收敛：对接 dsh 真实类型，减少 `any`。
- [ ] 11. 配置/安全：避免 Token 出现在日志中；启动失败时给出明确错误。
