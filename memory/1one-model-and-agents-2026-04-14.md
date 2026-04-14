# 1ONE Code 模型与本地 Agent（2026-04-14）

本文件记录本轮已落地的「模型配置 / 健康检测 / 对话链路 / 本地 Agent」相关事实，供后续会话直接复用。

## 本地 Agent 与设置 UI

- 本地 Agent：**扫描本地 Agent（重新检测 PATH/CLI）**（绿色按钮），走 `ipcBridge.acpConversation.refreshDetectedAgents` → `acpConversationBridge` → `acpDetector.refreshAll()`；入口在 `LocalAgents.tsx`。
- **添加/编辑模型**：支持自定义请求协议/模式；持久化 `authType: 'custom'` 与 `authTypeCustom`（`providerAuthType.ts`、`storage.ts` 的 `IProvider`、`platformAuthType.ts`、`AddPlatformModal` / `EditModeModal`）。

## OpenAI 兼容 baseUrl

- `ClientFactory`：`normalizeOpenAiCompatBaseUrl`（已 **export**）— 支持 `compatible-mode` 路径；对已有 `/v*`、`/api/v*` 等采用**保守策略**，避免误拼 `/v1`。
- **Gemini worker 环境变量**：`src/process/agent/gemini/index.ts` 的 `initClientEnv` 中，对非 new-api 且 `USE_OPENAI` 的 `OPENAI_BASE_URL` 使用与 `ClientFactory` 相同的 `normalizeOpenAiCompatBaseUrl`，使**设置页健康检测**（临时 `gemini` 会话）与真实请求路径一致，减少 405 误报。

## 健康检测与文案

- 逻辑与提示：`healthCheckUtils.ts`（`buildHealthCheckHint`）、`ModelModalContent.tsx`；i18n：`zh-CN` / `en-US` 的 `settings.json`（405、unsupported operation、协议不匹配等）。
- 历史红色状态不会随代码修复自动清除：用户可点 **「清除状态」** 后重新点心跳检测。

## 模型设置页性能

- `ModelModalContent` 改为 **React.lazy** + **Suspense**：`ModeSettings.tsx`、`SettingsModal/index.tsx`；弹窗打开时 **prefetch** `ModelModalContent` chunk；`SettingsPageWrapper` 空闲预加载中增加该 chunk。

## LiteLLM / max_completion_tokens

- `OneAgent.ts`：上游不支持 `max_tokens` 时的重试逻辑。
- `aionrs/envBuilder.ts`：`buildProjectConfig` 中对 `gpt-5*`、`o1/o3`、含 `codex` 等启发式使用 `max_completion_tokens` 字段名。

## Aionrs：模型身份与 system-reminder

- `AionrsManager.sendMessage`：`addMessage` 使用 **原始用户输入** `originalInput`；发给 worker 的 `data.input` 可带 `<system-reminder>` 注入，避免泄漏到聊天 UI / DB 用户气泡。
- 身份问句与 `pendingModelIdentityNotice` **二选一**注入，避免同一条消息叠两段 reminder。
- 会话 `extra.lastModelId`、产品线推断等用于切换模型后的身份回答一致性。

## 用户偏好

- 开发改动后自动重启：见 [user-dev-restart-preference-2026-04-14.md](./user-dev-restart-preference-2026-04-14.md)（`bun run restart`）。

## 与截图错误区分（ACP / Claude Code）

- 若会话类型为 **ACP + Claude Code** 且本机未安装或未配置 `claude` CLI，会报 **CLI not found** / bun 找不到 npm 模块等，与上文「自定义 OpenAI 网关模型」链路不同；需在 **Agent 设置** 中安装或修正 CLI 路径，或使用已配置好的 **aionrs / Gemini** 对话测模型身份。

## 回归修复：Claude ACP / OpenClaw PATH、Gemini Google CLI 认证（2026-04-14）

- **`shellEnv.getEnhancedEnv`**：bundled `bun` 目录不得排在 PATH **最前**（否则 Windows 上 `npx` 易解析为 Bun 的 shim，ACP 在 `claude-temp-*` 下报找不到 `npm-prefix.js` / `npx-cli.js`；OpenClaw 等也可能被错误解释器执行）。已改为将 bundled bun **追加**到 PATH 末尾；扩展仍可用 `getBundledBunDir()` 的绝对路径调用 bun。
- **`resolveNpxPath`（Windows）**：`where node` 可能多行且**首条**为 Electron/残缺 Node；回退到裸 `npx.cmd` 时仍可能命中 Bun。已改为**逐条尝试** `where node` 的每个路径，再回退扫描 `NVM_SYMLINK`、`FNM_MULTISHELL_PATH`、`Program Files\nodejs` 等带完整 `node_modules/npm` 的安装。
- **`GeminiAgent`**：构造函数曾把除 `vertex` 外全部写成 `USE_GEMINI`，导致 `gemini-with-google-auth` 无法走 `LOGIN_WITH_GOOGLE`（Google CLI 会话报 *default credentials*）。已改为静态方法 `resolveAuthType()`，按 `getProviderAuthType` 映射 `openai` / `anthropic` / `bedrock` / `vertex` / `LOGIN_WITH_GOOGLE`。
- **OpenClaw** `warning-filter.js` 缺失：多为全局 `npm i -g openclaw` 安装不完整；代码侧 PATH 修正后若仍失败，需重装或升级 `openclaw` CLI。

## aionrs 长时间「正在处理」无输出

- `AionrsAgent`：若上游在发送后 **120s** 内没有任何 JSON 行事件（滑动窗口在 `stream_start` / `text_delta` / `thinking` / `tool_*` / `info` 上续期），则主动发出 `error` + `finish`，避免 UI 永久卡在 `waitingResponse`（常见于网关挂死、DNS、代理或 baseUrl 不可达）。
