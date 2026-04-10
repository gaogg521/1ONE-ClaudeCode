# 团队/ WebUI / OpenClaw 修复要点（2026-04-10）

## OpenClaw：模型选择从用户本机配置读取

- **数据来源**：读取用户目录下的 `~/.openclaw/openclaw.json`（Windows: `C:\\Users\\<user>\\.openclaw\\openclaw.json`）。
- **模型列表**：从 `models.providers.*.models[]` 提取 `{ id, name, provider }`，用于 UI 下拉选择。
- **IPC**：新增 `ipcBridge.openclawConversation.getModels`，由主进程 `conversationBridge` 提供。
- **UI**：`openclaw-gateway` 会话顶部展示模型下拉；选择后停止当前 worker，并把 `conversation.model.useModel` 更新为所选 `id`（下次发消息生效）。

## WebUI：修复“网页版进不去/黑屏”与 jwt malformed 刷屏

- **根因**：WebUI 的 WebSocket token 校验误把非 JWT 的 `sec-websocket-protocol`（例如 Vite HMR 的 `vite-hmr`）当作 token 去校验，导致大量 `jwt malformed`，连接被关闭后前端陷入重连/不可用。
- **修复**：
  - WebSocketServer 绑定 **专用路径**：`/ws`（避免抢占同域其它 ws）。
  - 浏览器端桥接连接改为 `ws(s)://<host>/ws`。
  - token 提取增加“像 JWT 才算 token”的轻量校验（必须是 3 段 `a.b.c`），防止把 `vite-hmr` 这类协议值当 JWT。

## Team：修复会话脏数据与缺失会话导致的启动失败

- **Unsupported backend: acp**：
  - 历史数据可能把 `conversation.extra.backend` 错存为 `"acp"`（会话类型），会导致 ACP 连接报 `Unsupported backend: acp`。
  - 在 `workerTaskManagerSingleton` 创建 `AcpAgentManager` 时对 `extra.backend === 'acp'` 做兜底，强制用 `claude` 作为 backend，避免直接崩。
- **Conversation not found**：
  - Team agent 可能保存了已不存在的 `conversationId`（例如数据库清理/误删），启动时会报 `Conversation not found: <id>`。
  - `TeamSessionService.getOrStartSession()` 需要在创建 session 前校验每个 agent 的 `conversationId` 是否存在；若不存在则重建会话、回写 team.agents，并再启动 session。
- **可观测性**：
  - `ensureSession` 若失败，需把异常 message 通过 `ipcBridge.team.agentStatusChanged` 广播到每个 slot（`status=failed`, `lastMessage=message`），让 UI 能显示真实原因。
  - `TeammateManager.wake()` 失败时，把 error.message 写入 `lastMessage` 并打印日志，便于定位 CLI/认证/权限问题。

