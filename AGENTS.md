# dsh-telegram-bridge V1 Polish Checklist

> 每完成一项，就从本文件中删除对应条目。

## 高优先级

- [ ] 1. Bot 全局错误处理：设置 `bot.catch(...)`，单个错误不停止整个 bot。
- [ ] 2. 状态读写优化：内存缓存 + 原子持久化，避免频繁全量读盘和写坏 JSON。
- [ ] 3. Session 失效自动重建：prompt 失败时检测 `session-not-found`，自动创建新 session 并更新映射。

## 中优先级

- [ ] 4. 队列增强：加队列上限；多个消息排队时保留等待提示直到队列清空。
- [ ] 5. `/status` 信息增强：显示忙碌状态、provider、reasoning effort、消息数/token、preset 锁定状态。
- [ ] 6. 菜单体验：模型列表分页；显示当前已选值；思考强度按当前模型展示。
- [ ] 7. 消息格式：转义 HTML、识别代码块、按代码块边界分段。
- [ ] 8. 原生命令菜单不可见兜底：增加聊天内持久命令菜单。

## 低优先级

- [ ] 9. 自动化测试：为 StateStore、QueueManager、EventForwarder、回调编解码补单测。
- [ ] 10. 类型收敛：对接 dsh 真实类型，减少 `any`。
- [ ] 11. 配置/安全：避免 Token 出现在日志中；启动失败时给出明确错误。
