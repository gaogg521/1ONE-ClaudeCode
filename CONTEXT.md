# CONTEXT.md — 2026-06-23 深度体检修复记录

本文档记录本次跨两轮会话的完整修复过程，包括根因分析、修复方案和涉及文件。

---

## 背景

升级 aionrs engine 从 v0.1.7 到 v0.1.30（commit `a669517`）后，所有 OpenAI 协议模型（kimi-k2.5、qwen 等）出现"90秒内未收到模型响应"超时错误。同时暴露了若干其他架构缺陷。

---

## 修复清单

### 1. [已修复] 根因：aionrs 0.1.30 协议字段重命名 `input` → `content`

**问题**：aionrs 0.1.30 JSON-stream 协议将 `message` 命令的字段从 `input` 改名为 `content`。我们的 host 发出的消息仍然用 `input`，被 binary 以 `"missing field content"` 静默拒绝，导致所有消息超时。

**影响文件**：
- `src/process/agent/aionrs/protocol.ts` — `AionrsCommand` 类型 `input` → `content`
- `src/process/agent/aionrs/index.ts` — `send()` 方法构造 JSON 时使用 `content: input`
- `src/process/agent/one/OneAgent.ts` — `handleCommand()` 读 `cmd.content` 而非 `cmd.input`
- `src/process/task/OneManager.ts` — 构造 `AionrsCommand` 时用 `content: data.input`

### 2. [已修复] 移除无效的 `api = "openai-completions"` TOML 配置

**问题**：`envBuilder.ts` 的 `buildProjectConfig()` 会写入 `[providers.openai]` + `api = "openai-completions"` 到 `.aionrs.toml`。这是 aionrs ≤0.1.7 的字段，0.1.30 会忽略它。移除以保持 TOML 干净。

**影响文件**：
- `src/process/agent/aionrs/envBuilder.ts` — 移除整个 `[providers.openai]` 块，只在需要时写 `[providers.openai.compat]`

### 3. [已修复] BaseAgentManager.kill() 统一发射 synthetic finish（Fix #1）

**问题**：当 Manager 被 kill（模型切换、idle timeout、app 关闭），如果 worker 还在运行中未发出 `stream_end`/`finish`，渲染器的 sendbox 永久锁定在"正在进行对话中"。之前只有 AionrsManager 有修复，其他 5 个 Manager（ACP/Gemini/Nanobot/OpenClaw/Remote）全部存在此 bug。

**方案**：
- `BaseAgentManager` 新增 `kill()` 和 `emitSyntheticFinishOnKill()` 模板方法
- `kill()` 先调 `emitSyntheticFinishOnKill()` 再调 `ForkTask.kill()`
- `emitSyntheticFinishOnKill()` 检查 `status === 'running' || 'pending'` → 设 `status = 'finished'` → 发射 `finish` + `turnCompleted(canSendMessage: true)`
- AionrsManager override `emitSyntheticFinishOnKill()` 使用精确的 `activeTurnId`
- AcpAgentManager 在异步 grace-period 之前立刻调用 `emitSyntheticFinishOnKill()`

**影响文件**：
- `src/process/task/BaseAgentManager.ts` — 新增 `kill()` + `emitSyntheticFinishOnKill()` + 相关 import
- `src/process/task/AionrsManager.ts` — 从 `override kill()` 改为 `override emitSyntheticFinishOnKill()`，移除 `AgentKillReason` import
- `src/process/task/AcpAgentManager.ts` — 在异步流程前调用 `this.emitSyntheticFinishOnKill()`

**无需改动的 Manager**（自动通过基类受益）：
- `GeminiAgentManager.kill()` → 清 timer → `super.kill()` → 基类自动处理
- `NanoBotAgentManager.kill()` → `agent.kill()` → `super.kill()` → 基类自动处理
- `OpenClawAgentManager.kill()` → 同上
- `RemoteAgentManager.kill()` → 同上

### 4. [已修复] Worker exit handler 防孤儿进程（Fix #2）

**问题**：Windows `TerminateProcess` 不级联到孙进程。当 worker（utilityProcess）被 kill 时，它内部 spawn 的 aionrs.exe / CLI 子进程变成孤儿，占用端口和内存。

**方案**：在 worker 的 `forkTask` 回调中注册 `process.on('exit', () => agent.kill())`。

**影响文件**：
- `src/process/worker/aionrs.ts` — 新增 `process.on('exit', () => agent.kill())`
- `src/process/worker/acp.ts` — 新增 `process.on('exit', () => agent.kill().catch(() => {}))`

**不需要 exit handler 的 worker**：
- `gemini.ts` — GeminiAgent 用 HTTP API，不 spawn 子进程
- `nanobot.ts` — Stub file，in-process 运行
- `openclaw-gateway.ts` — Stub file，in-process 运行

### 5. [已修复] 模型切换后立刻刷新 renderer 的模型显示（Fix #3）

**问题**：切换模型后，kill 旧 worker 的 synthetic finish 携带旧 model info。新 worker 要到下次 sendMessage 才发 turnCompleted，中间空档期 renderer 显示旧模型。

**方案**：在 `conversationBridge.ts` 的 model-switch kill 之后，立刻发射一个带新 model 的 `turnCompleted(ai_waiting_input)`。

**影响文件**：
- `src/process/bridge/conversationBridge.ts` — kill 后新增 `emitConversationTurnCompleted(buildConversationTurnCompletedEvent({...nextModel}))` + 相关 import

### 6. [已修复] protocol.ts 补齐 aionrs 0.1.30 协议类型（Fix #4）

**问题**：`AionrsEvent` 和 `AionrsCommand` 联合类型缺少 0.1.30 新增的事件和命令。

**新增 Event 类型**：
- `ready` event 新字段：`effort`、`effort_levels`、`modes`、`current_mode`
- `config_changed` — 配置变更通知
- `mcp_ready` — MCP server 连接就绪
- `pong` — 心跳响应

**新增 Command 类型**：
- `set_config` — 动态修改配置
- `add_mcp_server` — 动态添加 MCP server
- `ping` — 心跳请求

**影响文件**：
- `src/process/agent/aionrs/protocol.ts`

### 7. [已修复] 诊断基础设施

**新增**：aionrs 启动参数加 `--log-dir` 和 `--log-level debug`，方便排查 binary 内部错误（TOML 解析、HTTP 请求、SSE 中断等）。

**影响文件**：
- `src/process/agent/aionrs/envBuilder.ts` — `buildSpawnConfig()` 新增 `--log-dir` / `--log-level` 参数
- `src/process/agent/aionrs/index.ts` — 启动时写 `.aionrs-spawn.log`（含完整 args + stack trace）、镜像 `.aionrs-stdout.log` / `.aionrs-stderr.log`、未知事件写 `.aionrs-unknown-events.log`

---

## 涉及文件完整列表

| 文件 | 改动类型 |
|------|---------|
| `src/process/agent/aionrs/protocol.ts` | 字段重命名 + 补齐 0.1.30 类型 |
| `src/process/agent/aionrs/envBuilder.ts` | 移除无效 TOML + 加诊断日志参数 |
| `src/process/agent/aionrs/index.ts` | send() 用 content + 诊断文件输出 |
| `src/process/agent/one/OneAgent.ts` | cmd.input → cmd.content |
| `src/process/task/BaseAgentManager.ts` | 新增 kill() + emitSyntheticFinishOnKill() |
| `src/process/task/AionrsManager.ts` | kill → emitSyntheticFinishOnKill override |
| `src/process/task/AcpAgentManager.ts` | kill() 中提前调 emitSyntheticFinishOnKill() |
| `src/process/task/OneManager.ts` | AionrsCommand 构造 input → content |
| `src/process/bridge/conversationBridge.ts` | model switch 后发射新 model turnCompleted |
| `src/process/worker/aionrs.ts` | process.on('exit') kill 子进程 |
| `src/process/worker/acp.ts` | process.on('exit') kill 子进程 |

---

## 测试要点

1. **OpenAI 协议模型可正常对话** — kimi-k2.5、qwen 等不再超时
2. **切换模型不锁死 sendbox** — 对话中切换模型，输入框立刻可用
3. **模型标识即时更新** — 切换后 UI 立刻显示新模型名称
4. **无孤儿进程** — 切换模型 / 关闭会话后任务管理器中无残留 aionrs.exe
5. **所有 agent 类型 kill 后 sendbox 解锁** — ACP/Gemini/Nanobot/OpenClaw/Remote 均需验证

---

# 追加记录 — 2026-06-23 下午（深度体检 + 多模态 + 个人版边界 + ffmpeg 下载器）

承接上面的修复，本轮继续完成一长串改动。全部 `tsc`/`lint`/`oxfmt`/i18n 通过。

## 一、sendbox / 日志 / kill 深度检查修复
- **诊断日志移出工作区**：`.aionrs-*.log` 与 aionrs `--log-dir` 改写到 `cacheDir/aionrs-logs/<conv>/`（不再污染用户项目、不进 git）；默认 `--log-level` 从 debug 降到 info；stdout/stderr 镜像每会话截断。涉及 `envBuilder.ts`、`index.ts`、`AionrsManager.ts`。
- **ACP 等 kill 上报真实模型**：`AcpAgentManager` override `emitSyntheticFinishOnKill()`，用真实 modelPlatform/modelId + activeTurnId，finish 走 acpConversation 通道。
- **抑制误报**：`AionrsAgent` 新增 `killed` 标志，主动 kill 时 exit handler 不再弹"进程意外退出 exit code null"。
- **模型身份提醒路由**：`AionrsManager.sendMessage` 把提醒同时写进 `input` 和 `agentPrompt`（worker 实际发 `agentPrompt ?? input`，只改 input 会被吞）。

## 二、多模态输入（aionrs 纯文本引擎，全部"转文字再注入 agentPrompt"）
- **图片**：根因是图片描述写进 input 被 worker 吞掉 → 已改写进 agentPrompt。新增 `visionModelResolver.ts`：对话模型多模态就直接用（Kimi K2.6/Qwen-VL），否则回退到任意 `vision` 能力的已配置模型。
- **PDF 预览**：删掉报"未能加载 PDF 文档"的 Chromium iframe 预览（`InlinePdfPreview.tsx` 已删），改成干净文件卡片；文本抽取本就工作。
- **视频（借鉴豆包流程）**：`attachmentTextExtractor.ts` 新增 `probeVideoMetadata`（ffprobe 元数据）+ 时长感知均匀采样 ≤5 关键帧（`computeSampleTimestamps`）+ 逐帧 `describeImage`，注入 `[Video metadata]`/`[Frame @Ns]`。
- **音频/STT**：保留「网关 whisper-1 兜底」(`SpeechToTextService.transcribeDirect`)；STT 顺序=已配置 provider → 对话/视觉模型网关 `/audio/transcriptions`。媒体解析超时放宽到 120s。
- **统一**：图/音/视频从 aionrs `files` 一律剥离（`isMediaFilePath`），内容只走 agentPrompt。

## 三、个人版 / 企业版边界（3 个 UI Bug）
- **个人版隐藏企业 hub**：`useEditionFeatures.showEnterpriseWorkspaceHub` 加 `isEnterpriseEdition &&` → 个人版不再出现「企业协同与平台能力」整块及「组织管理后台」卡片。
- **身份面板隐藏企业归属**：`WorkspaceIdentityPanel` 个人版隐藏 所属团队/组织架构/管理员角色标签。
- **登录企业账号可达**：`login/index.tsx` 已登录的本地桌面操作员在企业登录意图下不再被自动弹走，能进企业登录表单重登。

## 四、ffmpeg/ffprobe 一键下载（新功能）
- **解析器**（`shellEnv.ts`）：新增 `getFfmpegToolsDir()`，`getBundledFfmpeg/FfprobePath` 查找顺序 bundled→下载目录→系统 PATH；下载目录注入子进程 PATH。
- **后端**（`ffmpegInstaller.ts`）：`getFfmpegStatus()` 检测 + `downloadFfmpegTools()` 按平台下载官方静态构建（Win/Linux 用 BtbN，mac 用 evermeet），系统 `tar` 解压，定位并复制 ffmpeg/ffprobe。
- **IPC**：`systemSettings.getFfmpegStatus/downloadFfmpeg/ffmpegDownloadProgress`。
- **UI**：设置→工具新增「媒体工具」区块，显示检测状态 + 「一键下载」按钮 + 进度条。i18n `settings.mediaTools.*`（en/zh）。
- 安装包仍不打包 ffmpeg（体积）；已装就用 PATH，没装就一键下载到 app 目录。

## 本轮验证状态
- `tsc --noEmit` exit 0；`oxlint` 0 error；`oxfmt --check` 全过；`check-i18n` 通过；`electron-vite build` 通过；单测全绿（45 个既存失败与本次改动无关，均为 layout/nav 等 UI 测试）。
- 运行时（切模型、传图/视频、个人版 UI、ffmpeg 下载）需桌面端 `npm run restart` 实测。
