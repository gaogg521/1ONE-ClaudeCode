# Project Memory Index

This file indexes all memories for the 1ONE ClaudeCode project. **Repo-local facts** live under this repository’s `memory/` directory (committed with the project). Claude Code may also mirror under `~/.claude/projects/<path>/memory/`.

## User Memories
- [开发改动后自动重启（2026-04-14）](memory/user-dev-restart-preference-2026-04-14.md) — 完成影响主进程/渲染层的改动后应执行 `bun run restart`；agent 终端无 `npm` 时用 `bun`。

## Feedback Memories
- (none yet)

## Project Memories
- [1ONE 模型与本地 Agent（2026-04-14）](memory/1one-model-and-agents-2026-04-14.md) — 自定义协议持久化；OpenAI 兼容 URL 规范化（ClientFactory + Gemini worker）；健康检测文案与 lazy 模型页；Aionrs 身份注入与防泄漏；LiteLLM max_completion_tokens；与 ACP Claude CLI 错误区分。
- [设置页与 Guid 助手导航（2026-04-10）](memory/settings-guid-navigation-2026-04-10.md) — Guid「+」→ `/settings/assistants`；扩展 Tab SWR 共享 hook；侧栏精确路径匹配与预加载设置 chunk。
- [团队/ WebUI / OpenClaw 修复要点（2026-04-10）](memory/team-webui-openclaw-fixes-2026-04-10.md) — Team 会话自愈（backend/acp 与丢失 conversationId）；WebUI `/ws` 避免 jwt malformed；OpenClaw 从 `~/.openclaw/openclaw.json` 读模型并支持选择。

## Reference Memories
- (none yet)
