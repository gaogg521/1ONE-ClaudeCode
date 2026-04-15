# Project Memory Index

This file indexes all memories for the 1ONE ClaudeCode project. **Repo-local facts** live under this repository’s `memory/` directory (committed with the project). Claude Code may also mirror under `~/.claude/projects/<path>/memory/`.

## User Memories
- [开发改动后自动重启（2026-04-14）](memory/user-dev-restart-preference-2026-04-14.md) — 完成后应 **`npm run restart`**；勿默认用 bun；仅当 shell 中 npm 不可用时再说明并备选。
- [重启脚本、打包与示例模块（2026-04-14）](memory/session-2026-04-14-restart-packaging-demo.md) — `restart-dev.mjs` 用 Node 直调 electron-vite CLI；白屏与 API 502/400 备忘；**`npm run dist:win`** 产出位置；任务看板 / Hook / MCP 已随应用包打进 asar + 内置 MCP 拆包说明；**ForkTask respawn**：MCP 指纹变化 `kill()` 后须重新 `fork`，否则第二条消息挂死（已修 `ForkTask.ts`）。

## Feedback Memories
- (none yet)

## Project Memories
- [Gemini CLI 会话日志、导航入口与 Windows 打包（2026-04-15）](memory/gemini-cli-session-logs-and-win-pack-2026-04-15.md) — OpenAI 流 `{}{json}` 解析失败与 fail-fast；`.gemini/logs` 请求/错误 dump；导航条「查看该会话详细日志」；`shell.openFolderEnsure`；**`npm run dist:win`** → `out/`。
- [LiteLLM / new-api 网关头与配置（2026-04-14）](memory/litellm-new-api-gateway-2026-04-14.md) — `Api: openai-completions` + `Protocol: openai` 双头；探测与 `ClientFactory` / `OneAgent`；`LITELLM_OPENAI_WRAPPER_CONFIG_EXAMPLE`；aionrs `openai-completions`；单测路径。
- [1ONE 模型与本地 Agent（2026-04-14）](memory/1one-model-and-agents-2026-04-14.md) — 自定义协议持久化；OpenAI 兼容 URL 规范化（ClientFactory + Gemini worker）；健康检测文案与 lazy 模型页；Aionrs 身份注入与防泄漏；LiteLLM max_completion_tokens；与 ACP Claude CLI 错误区分。
- [设置页与 Guid 助手导航（2026-04-10）](memory/settings-guid-navigation-2026-04-10.md) — Guid「+」→ `/settings/assistants`；扩展 Tab SWR 共享 hook；侧栏精确路径匹配与预加载设置 chunk。
- [团队/ WebUI / OpenClaw 修复要点（2026-04-10）](memory/team-webui-openclaw-fixes-2026-04-10.md) — Team 会话自愈（backend/acp 与丢失 conversationId）；WebUI `/ws` 避免 jwt malformed；OpenClaw 从 `~/.openclaw/openclaw.json` 读模型并支持选择。

## Reference Memories
- (none yet)
