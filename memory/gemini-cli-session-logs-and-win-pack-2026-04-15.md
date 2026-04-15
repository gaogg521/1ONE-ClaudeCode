# 2026-04-15 Gemini CLI 会话日志、导航入口与 Windows 打包备忘

## Gemini CLI + OpenAI 兼容模型流解析失败

- 现象：`aioncli-core` 的 `OpenAIContentGenerator.convertStreamChunkToGeminiFormat` 报 `Unexpected non-whitespace character after JSON`，`jsonString` 形如 `{}{"dir_path":"..."}`（多段 JSON 被拼在同一 chunk），随后 `[StreamMonitor]` 反复 connected/disconnected。
- 根因：在 **Gemini CLI 运行时** 走 `AuthType.USE_OPENAI` 且上游网关/SSE 分帧不符合 `aioncli-core` 预期；日志里若出现 `[Routing] ... agent-router/override` 与 `glm-5`，说明模型被强制覆盖，会加剧该路径。
- 代码：`src/process/agent/gemini/index.ts` 中对 **非 LiteLLM 代理** 的 `USE_OPENAI` 在构造时 **fail-fast**（避免无限重连卡顿）；LiteLLM 仍走 `USE_OPENAI`（`isProviderLiteLlmProxy`）。

## 会话请求 / 错误日志（主进程）

- 开关：`settings.json` 的 `enableOpenAILogging`，或环境变量 `ONE_GEMINI_REQUEST_LOG=1`。
- 追加：`submitQuery` 前打 `[GeminiRequest] ...` 摘要；`handleMessage` catch 时在开关开启下写 `error-*.log`。
- 目录：**`<workspace>/.gemini/logs/`**（`requests-YYYY-MM-DD.log`、`error-<iso>-<msg_id>.log`）。

## 渲染层：导航条「查看该会话详细日志」

- 组件：`src/renderer/pages/conversation/platforms/gemini/GeminiSessionLogsLink.tsx`（路径与主进程一致：`geminiSessionLogsDir(workspace)`）。
- 挂载：`ChatConversation.tsx` 里 `GeminiConversationPanel` 的 `headerExtra`，在 `CronJobManager` 左侧。
- i18n：`conversation.gemini.*`（六种 `conversation.json`）。

## Shell：打开并确保日志目录存在

- IPC：`ipcBridge.shell.openFolderEnsure` → channel `shell.open-folder-ensure`；主进程 `mkdir` 递归后 `shell.openPath`；独立模式见 `shellBridgeStandalone.ts`。
- 单测：`tests/unit/shellBridge*.test.ts` 已更新 provider 数量与 `openFolderEnsure` 用例。

## Windows 安装包

- 命令：**`npm run dist:win`**（即 `node scripts/build-with-builder.js auto --win`）。
- 产物：仓库根目录 **`out/`**（NSIS / zip 等，见 `electron-builder.yml` 的 `artifactName`）。
