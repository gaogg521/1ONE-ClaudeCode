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

---

# 追加记录 — 2026-06-23 晚（边界二次核查 + i18n 结构性修复 + 登录回传体检 + 踩坑）

## 一、个人版/企业版边界二次修复（防"混在一起"）
上轮加了 `useEditionFeatures.showEnterpriseWorkspaceHub` 助手，但**根本没接到页面里**，页面仍用裸 `hasJoinedEnterprise` 渲染，导致个人版视图仍泄漏企业 UI。本轮真正堵住：
- `sessions/index.tsx`、`tasks/index.tsx`：「企业协同与平台能力」区块 `hasJoinedEnterprise` → `isEnterpriseEdition && hasJoinedEnterprise`。
- `Titlebar/index.tsx`：企业通知中心 `showNotificationCenter` 漏判版本 → 加 `isEnterpriseEdition`。
- `WorkspaceIdentityPanel.tsx` `buildOrgLine`：个人版视图原显示 `{租户} · 个人版视图` 泄漏租户名 → 改为只显示「个人版」。

## 二、i18n 结构性坑（重点教训）
- **坑1**：`nav`、`sessions` 两个 namespace **未纳入 `i18n-config.json` 的 modules 列表** → `check-i18n` 长期漏检。已补进 modules 根治。
- **坑2**：`ja/ko/tr/zh-TW` 缺整个 `nav.json`；除 `zh-CN` 外全缺 `sessions.json`（连 `en-US` 也缺）→ 这些语言侧栏导航、会话页文案**回退成简体中文**（fallbackLng=zh-CN）。已补 4 语言 `nav.json` + 5 语言 `sessions.json`，并在各 `index.ts` 挂载。
- **坑3（待产品确认）**：`supportedLanguages` 声明 **6 种语言（含 tr-TR 土耳其语）**，这是项目既有配置，非本轮新增。但 `settings(445)/common(250)/conversation(42)/login(19)/memory(4)/team(2)/messages(1)` 在 `ja/ko/tr/zh-TW` 大面积缺 key，靠 `defaultValue` 兜底显示中/英。**是否真要维护 6 语言、还是精简 `supportedLanguages`，需先确认，再决定"补译 or 删语言"。**
- **坑4（流程教训）**：上一轮规划了"分 4 批 ×4 语言补译"的 task 并把前几批标 `completed`，但 `check-i18n` 实证 `common/conversation/login` 根本没补 = **虚假进度**。已纠正 task 状态。补译前必须先与用户对齐语言范围，且以 `check-i18n` 实测为准，不以 task 标记为准。

## 三、企业版登录回传链路体检（桌面端）
- **两条路径**：账号密码/LDAP = **应用内直登**（JWT 直接写桌面 session，不跳浏览器）；SSO（飞书/钉钉/企微/扫码）= **跳系统浏览器**授权后回传。
- **回传机制**：`syncBrowserWebuiSessionToDesktop` → IPC `webui.syncBrowserWebuiSession` → 主进程 `WebuiService.syncBrowserWebuiSession`（先内存桥接 `getLatestBrowserWebuiSession` 取 `updatedAt` 最新 + `verifyToken`，否则遍历 localhost/LAN cookie jar 读 token）。触发：`window focus` / `visibilitychange` / `one-enterprise-context-refresh` → `scheduleFullRefresh`(800ms 防抖) → sync → `refreshAuth` → `refreshEnterpriseContext`。
- **薄弱点（待修，按优先级）**：
  1. **缺超时**：主进程 `cookies.get/verifyToken/findById` 串行 await 无超时；渲染层 `sync→refreshAuth→refreshEnterpriseContext` 链无整体超时 → DB/cookie 卡顿会让"切回桌面自动刷新"挂起。
  2. **同步失败静默**：跨实例/token 失效返回 null，UI 无任何提示；`getDesktopSessionToken` 无会话直接 throw，依赖调用方兜底。
  3. **多实例**：token 用本机密钥 verify，跨实例登录验证失败→同步不到（设计上安全、不串号，但无提示）。
  4. **`scheduleFullRefresh` 未 `.catch`**：链路 sync 抛错产生 unhandled rejection（有 `.finally` 复位 in-flight 标志，不卡死）。

## 本轮状态
- 已改：边界 3 处 + i18n 结构性 nav/sessions。
- **语言范围已定（用户决策）**：只保留 `zh-CN` + `en-US`，**删除 ja-JP / ko-KR / zh-TW / tr-TR**。涉及：4 个 locale 目录、renderer+main 两处 i18n 注册表、`main.tsx` Arco locale 映射（含 koKRComplete）、`LanguageSwitcher`/`login` 语言列表、`utils.resolveLocaleKey`、`i18n.normalizeLanguageCode`、`i18n-config.supportedLanguages`。中英本就齐全，**无需补译**。同步修了 4 个引用旧语言的测试文件。
- `tsc` exit 0；`check-i18n` 通过（仅 zh-CN/en-US，完整）；受影响 i18n 测试 121 passed。
- 坑3/坑4 的"补译 ×4 语言"计划随精简语言一并作废。
- **登录回传薄弱点已修**：`WebuiEnterpriseModeProvider.scheduleFullRefresh` 的 `sync→refreshAuth→refreshEnterpriseContext` 链改用 `withEnterpriseBootstrapTimeout` 包裹。一并解决 #1（同步链卡死时 `desktopSyncInFlightRef` 永不复位 → 永久禁用后续焦点同步）+ #4（未捕获 rejection）；失败/超时有带 label 日志（覆盖 #2 诊断）。`handleEnterpriseContextRefresh` 同样加超时兜底。#3 多实例验证为设计安全（token 验证失败不串号），未改；主进程内部不加超时（渲染层 8s 超时已覆盖症状）。`webuiEnterpriseModeProvider` 测试 9 passed。
- **会话首发提速**：根因定位——aionrs 首发慢是 `useGuidSend` 的 aionrs 分支漏了「跳转前 warmup」（ACP 分支早有，注释 "so the first reply feels faster"）。已补：创建会话后、`navigate` 前 `void conversation.warmup.invoke`，让 binary 在跳转/渲染期间提前 spawn。临时 `perfTrace` 埋点实测：`send.taskReady` 0ms 证明 worker fork/spawn 已移出首发路径；剩余 ~2.8s 为 `AionrsAgent.send()` 的 `await readyPromise`（binary 连 provider/ready）。首发从 ~5s 降到 ~2.8s。埋点已移除。
  - **预热池方案 B（已落地）** —— 消除剩余 ~2.8s 的 `await readyPromise`，目标首发 <500ms。
    - **设计抉择**：放弃严格「过户」（要 rewire `AionrsManager` 里 5+ 处 `conversation_id` 使用点 + binary session_id + aionrsSessionId 持久化字段，风险面大）。改用「预热即建会话」：预热时直接 `conversationService.createConversation` 一个占位会话（name=`__prewarm__`），manager 持有真实 conversation_id；send 时 key 命中就 finalize（改 name + merge extra），未命中删占位 + kill 走原 create。manager/binary/DB 三者 id 自始至终一致，不动 `AionrsManager` 一行。
    - **时机**：Guid 页 watch `[selectedAgent==='aionrs', currentModel.id, useModel, dir, sessionMode]`，稳定 200ms 后触发 `conversation.prewarmCreate` IPC（`useAionrsPrewarm` hook）。
    - **认领 key**：`${provider.id}::${useModel}::${workspace}` —— 同 provider 多 model 也能区分；workspace 为空时用占位空串保持稳定。
    - **池行为**：容量 1。同 key 重复触发 no-op + 刷新 TTL；不同 key 来了先 evict（kill worker + 删 DB 占位）再装新的。15s TTL 自动 evict 防泄漏。启动期 `AionrsPrewarmPool.sweepPlaceholderConversations` 扫一次脏占位（崩溃时的兜底）。
    - **侧栏不闪现**：`conversationService.createConversation` 不 emit `listChanged`，占位 conversation 在 finalize 前不进入侧栏；finalize 时才 emit `created`。
    - **失败兜底**：`prewarm.create` / `prewarm.claim` / `finalizeFromPrewarm` 任何环节失败渲染层都自动回落到原 `conversation.create.invoke + warmup` 路径，性能损失但行为不变。
    - **文件**：新增 `src/process/task/AionrsPrewarmPool.ts`、`src/renderer/pages/guid/hooks/useAionrsPrewarm.ts`、`tests/unit/process/task/AionrsPrewarmPool.test.ts`（6 单测覆盖 register/claim/evict/TTL/sweep）；改 `ipcBridge.ts`（3 通道）、`conversationBridge.ts`（3 handler）、`bridge/index.ts` + `initBridgeStandalone.ts`（注入 pool）、`workerTaskManagerSingleton.ts`（导出 pool + 启动扫描）、`useGuidSend.ts`（aionrs 分支 claim 优先 fallback create）、`GuidPage.tsx`（挂 hook）。
    - **验证**：`tsc --noEmit` exit 0；`oxlint` 0 errors；`oxfmt --check` 全过；`vitest run conversationBridge*/aionrsImageToolResult/initBridgeStandalone/AionrsPrewarmPool` 28 passed。运行时需桌面端 `npm run restart` 实测首发延迟（预热命中应 <500ms，未命中走原 ~2.8s 路径）。
    - **未实施**：其他 agent 类型（ACP 已有 warmup 够用；其余无诉求）；池容量 >1；跨进程持久化。
- **语言切换入口**：语言切换组件本就在「设置→系统→偏好设置」首项（`SystemModalContent.preferenceItems`），但入口太深、用户找不到。已在标题栏（`Titlebar` 工具区）加全局可见的紧凑语言下拉（地球图标 + 简体中文/English），复用 `changeLanguage`。
- 已 commit + push（不打包，按用户要求）。

---

# 追加记录 — 2026-06-24（ACP Agent 一次批准、全局放行）

## 背景

kimi/goose/auggie 等 ACP 后端在执行本地文件操作（整理桌面文件、移动/删除文件等）时，每条命令都弹权限确认框，用户体验极差。根因：
1. **YOLO 模式选项缺失** — kimi 等后端不在 `AGENT_MODES` 里，Guid 页面无法选 YOLO
2. **ApprovalStore 精确匹配** — 即使用户点了"始终允许"，换一条命令就得重新批准
3. **1ONE 层缺 fallback** — 后端 CLI 不支持 `session/set_mode` 时没有兜底自动批准机制

## 修改清单

### 1. 给所有 ACP 后端添加 YOLO 模式选项

**文件**: `src/renderer/utils/model/agentModes.ts`

- 新增 `DEFAULT_ACP_MODES` 常量（`[default, yolo]`）
- `getAgentModes()` fallback：不在 `AGENT_MODES` 里的后端返回 `DEFAULT_ACP_MODES`
- `supportsModeSwitch()` 对所有有 backend 的后端返回 `true`

### 2. Guid 页面默认选 YOLO 覆盖所有后端

**文件**: `src/renderer/pages/guid/hooks/useGuidAgentSelection.ts`

- 替换硬编码的 `autoApproveValues` map（仅 5 个后端），改为从 `getAgentModes()` 动态查找 yolo/bypassPermissions 选项
- 效果：kimi/goose/auggie 等首次进入 Guid 页面时自动选中 YOLO 模式

### 3. AcpAgent handlePermissionRequest 添加 yoloMode 自动批准

**文件**: `src/process/agent/acp/index.ts`（handlePermissionRequest ~行 1148）

- 在 ApprovalStore 检查之后、弹窗之前新增 `this.extra.yoloMode` 判断
- 为 true 时直接 resolve allow_once，不弹 UI
- 效果：即使后端 CLI 不支持 `session/set_mode`，1ONE 也在自己这层自动批准所有权限请求

### 4. ApprovalStore 支持 kind+title 级别模糊匹配

**文件**: `src/process/agent/acp/ApprovalStore.ts`

- 新增 `serializeBroadKey()`：只序列化 `kind` + `title`（不含 `rawInput`）
- `put()` 存 `allow_always` 时同时存精确 key 和 broad key
- `isApprovedForSession()` 先查精确 key，再查 broad key
- 效果：non-YOLO 模式下，用户批准一次 `ExecCommand dir ...`，后续所有 `ExecCommand` 自动通过

### 5. 启动时 yoloModeMap 扩展 + 静默 fallback

**文件**: `src/process/agent/acp/index.ts`（enableYoloMode ~行 495 + startSession ~行 363）

- `enableYoloMode()`：不在 yoloModeMap 里的后端尝试通用 `'yolo'` session mode，失败静默
- `startSession` yolo 分支：同样对未知后端 try `applySessionMode('yolo', false, ...)`
- 效果：能用 CLI 原生 YOLO 就用，不能用就走第 3 步的 1ONE 层兜底

## 涉及文件

| 文件 | 改动类型 |
|------|---------|
| `src/renderer/utils/model/agentModes.ts` | 新增 DEFAULT_ACP_MODES + fallback 逻辑 |
| `src/renderer/pages/guid/hooks/useGuidAgentSelection.ts` | 动态查找 yolo 替代硬编码 map |
| `src/process/agent/acp/index.ts` | handlePermissionRequest yoloMode 检查 + enableYoloMode fallback |
| `src/process/agent/acp/ApprovalStore.ts` | broad key 模糊匹配 |

## 验证状态

- `tsc --noEmit` exit 0
- `vitest run` 469 passed（2 个 toolsModalContent 既存失败与本次无关）
- 运行时需桌面端 `npm run restart` 实测：选 kimi/qwen agent → 发"帮我整理桌面文件" → 确认不弹权限框

---

# 追加记录 — 2026-06-25 企业版功能深度审查与修复

## 背景

用户要求审查企业后台 21 个一级功能（路由元数据见 `src/common/auth/enterpriseRoutes.ts`）的代码 bug、逻辑漏洞和产品设计缺陷。4 路并行审查后共发现 **15 高 + 21 中 + 11 低** 共 47 项问题。本节记录修复过程。

## 修复清单（按批次）

### 批次 1：安全红线（RCE / SSRF / 凭证销毁）

#### 1.1 [已修复] Pipeline run 路由无鉴权 → member 可 RCE
- **位置**：`src/process/webserver/routes/devops/cciRoutes.ts:82`
- **问题**：`POST /api/admin/pipelines/run/:pipelineId` 只挂 `auth`，未挂 `requireDevopsAdmin`，任意 member 可触发任意已配置 pipeline = 执行任意 shell。
- **修复**：路由加 `requireDevopsAdmin` 中间件。

#### 1.2 [已修复] Pipeline executeCommand 无工作目录/环境隔离
- **位置**：`src/process/services/pipeline/PipelineService.ts:514-545`
- **问题**：`spawn(shellCmd, ['-c', command])` 无 cwd / env 限制，命令在服务进程 cwd 运行，继承全部环境变量。
- **修复**：传入受控 cwd（pipeline 工作区目录）+ 过滤后的 env（仅保留 PATH/SystemRoot 等必要变量）。注：完整沙箱超出本轮范围，命令白名单需产品决策。

#### 1.3 [已修复] RAG URL 导入 SSRF
- **位置**：`src/process/webserver/routes/devopsRoutes.ts:283-343`
- **问题**：`fetch(url)` 无内网过滤，可抓 `169.254.169.254`（云元数据）、`localhost:9230`（devtools）、内网 IP。
- **修复**：新增 `assertSafeFetchUrl()` —— 协议白名单（http/https）+ DNS 解析后拒绝私有/回环/链路本地/组播段。

#### 1.4 [已修复] MCP toggle 开关清空所有凭证
- **位置**：`src/renderer/pages/admin/AdminMcp.tsx:184-204`；后端 `devopsRoutes.ts` MCP save 路由
- **问题**：toggle 时前端传 `env: {}`，后端 merge 逻辑把已存 env_json 永久覆盖为 `{}`，用户每次切开关丢 API_KEY/TOKEN。
- **修复**：新增专用 `PATCH /api/admin/mcp/registry/:id/toggle` 端点只更新 `enabled` 字段；前端 toggle 改调此端点，不再走 saveMcpRegistry。

#### 1.5 [已修复] Requirements PATCH/DELETE 越权
- **位置**：`src/process/webserver/routes/devopsRoutes.ts:514`（PATCH 用 `optionalAuth`）、`647`（DELETE 无 ownership 校验）
- **问题**：任意 member 可改/删他人创建的 epic 及子卡片，物理删除无软删。
- **修复**：PATCH 改 `auth`；DELETE 加 created_by/role 校验（admin 可删任意、member 只删自己创建）；保留物理删除（软删需 schema 改动，本轮不动）。

### 批次 2：跨租户 + 团队 owner 保护

#### 2.1 [已修复] 跨租户越权改/删用户
- **位置**：`src/process/webserver/routes/adminRoutes.ts` PATCH `/api/admin/users/:id/role`、DELETE `/api/admin/users/:id`
- **修复**：操作前 `UserRepository.findById(id)` 取目标用户的 `tenant_id`，与 `resolveAdminTenantId(req)` 比对，不一致返回 403。

#### 2.2 [已修复] addTeamMember 静默降级 owner
- **位置**：`adminRoutes.ts` POST `/api/admin/teams/:id/members`
- **修复**：若新 role 不是 owner 且已是 owner，返回 400 提示走修改角色接口。

#### 2.3 [已修复] removeTeamMember / updateRole 无 last-owner 保护
- **位置**：`adminRoutes.ts` PATCH/DELETE `/api/admin/teams/:id/members/:userId`
- **修复**：降级或移除 owner 前 `COUNT(*) WHERE role='owner'`，若 ≤1 返回 400。

### 批次 3：认证/密码/RBAC 一致性

#### 3.1 [已修复] "记住密码"明文存储
- **位置**：`src/renderer/pages/login/index.tsx`
- **修复**：移除 `REMEMBERED_PASSWORD_KEY`、`obfuscate/deobfuscate`；"记住我"只记住用户名，不再存密码。

#### 3.2 [已修复] OAuth 回调 URI 回退 Host header
- **位置**：`src/common/auth/oauthCallbackUri.ts`
- **修复**：未配置 redirectUri 时只允许 localhost/127.0.0.1/::1 作为回退（dev 模式），其他 Host 一律返回空，强制显式配置。

#### 3.3 [已修复] security/usage 路由 RBAC 不一致
- **位置**：`src/common/auth/enterpriseRoutes.ts`
- **修复**：`security` 和 `usage` 路由 `requiresRole` 从 `member` 改为 `admin`，与后端 `requireAdmin` 中间件对齐。

#### 3.4 [已修复] admin 角色映射前后端不一致
- **位置**：`authRoutes.ts`、`oauthLoginHelpers.ts`、`AuthService.ts`、`UserRepository.ts`、`TokenMiddleware.ts`
- **修复**：所有 `normalizeRole` 中 `admin` 一律归一化为 `org_admin`（原来是 system_admin），与 `adminRoutes.ts` 的 roleMap 对齐，避免权限静默升降。

#### 3.5 [已修复] 邀请码 preview 泄露租户名
- **位置**：`enterpriseJoinService.ts`、`enterpriseJoin.ts`、`ipcBridge.ts`、`WebuiJoinEnterprisePanel.tsx`
- **修复**：preview 只返回 `{ valid: true }`，不再返回 tenantId/tenantName；前端文案改为"邀请码有效"。

### 批次 4：CMeas 三连击 + 审计日志 + 制品仓库

#### 4.1 [已修复] CMeas 显示最旧快照而非最新
- **位置**：`src/renderer/pages/admin/CMeasDashboard.tsx`
- **修复**：`reduce` 改为只取每个 metric_name 的第一条（后端已按 recorded_at DESC 排序）。

#### 4.2 [已修复] CMeas 失败率进度条反向逻辑
- **位置**：`CMeasDashboard.tsx`
- **修复**：invert 指标改用 `ratio = max(0, 1 - val/(target*2))`，高失败率显示空条（未达成），低失败率显示满条（达成）。

#### 4.3 [已修复] CMeas DORA 文案撒谎
- **位置**：`CMeasDashboard.tsx` 空状态文案
- **修复**：从"系统将在代码提交和流水线运行时自动采集"改为"请通过 API 或集成推送 DORA 指标"。

#### 4.4 [已修复] 审计日志覆盖 devops 写操作
- **位置**：`src/process/webserver/auth/auditLogService.ts` 新增 `recordDevopsAudit` + `DEVOPS_AUDIT_ACTIONS`；`devopsRoutes.ts` 在 requirements create/update/delete、MCP create/delete/toggle、RAG document delete 路由调用审计。
- **注**：制品仓库上传/下载端点的完整实现涉及新功能开发（非 bug 修复），留作产品决策，本轮不在范围内。

### 批次 5：中危 bug 修复

#### 5.1 [已修复] useEnterpriseAsyncData 竞态 + 卸载泄漏
- **位置**：`src/renderer/hooks/enterprise/modules/useEnterpriseAsyncData.ts`
- **修复**：引入 `requestIdRef` + `mountedRef`，旧请求结果不覆盖新请求，卸载后不 setState。

#### 5.2 [已修复] is_online 用错数据源
- **位置**：`adminRoutes.ts` member-dashboard
- **修复**：`is_online` 改用 `team_runtime_nodes.last_seen_at`（心跳 5 分钟阈值），不再用 `last_login`。同时删除 `TODAY_START`/`todayStartMs` 死代码。

#### 5.3 [已修复] LDAP resolve 顺序导致孤儿账号
- **位置**：`TeamAddMemberModal.tsx`
- **修复**：LDAP 路径先按 username 查 members 列表，已是成员则直接提示，不再先调 resolve 创建本地账号。Modal 新增 `members` prop。

#### 5.4 [已修复] AdminTeamRuntimes 静默吞错
- **位置**：`AdminTeamRuntimes.tsx`
- **修复**：消费 SWR 的 `error`，加载失败时显示错误提示卡片，不再永远显示空列表。

#### 5.5 [已修复] Pipeline 运行用假进度
- **位置**：`AdminPipelineEditor.tsx`
- **修复**：解析 `stages_status_json`，按每 stage 真实 status 渲染 Steps，后端未返回时按索引回退。

#### 5.6 [已修复] CFlow 列表 100 行硬限截断
- **位置**：`valueStreamRepository.ts`
- **修复**：LIMIT 从 100 提到 1000。

#### 5.7 [已修复] Milestone due_date 时区 bug
- **位置**：`MilestoneView.tsx`
- **修复**：`new Date(due_date)` 改为 `new Date('${due_date}T23:59:59')`，本地当天截止不算逾期。

#### 5.8 [已修复] CTest 切换计划双重加载
- **位置**：`CTestManagement.tsx`
- **修复**：删除手动 `useEffect(() => casesState.reload(), [selectedPlan?.id])`，hook 内部已自动响应 loader 变化。

#### 5.9 [已修复] CCode SELECT * 暴露 credential_id
- **位置**：`codeRepoRepository.ts`
- **修复**：显式列出列名并排除 `credential_id`，改返回 `has_credential` 布尔标志。

#### 5.10 [已修复] CCode/CPack 删除无二次确认
- **位置**：`CCodeRepoList.tsx`、`CPackArtifactRepo.tsx`
- **修复**：删除按钮包 `Modal.confirm`，CPack 提示将级联删除制品。

### 批次 6：低危清理

#### 6.1 [已修复] 成员列表 owner 不在首位
- **位置**：`adminRoutes.ts` listTeamMembers
- **修复**：`ORDER BY CASE role WHEN 'owner' THEN 0 ... END` 替代 `role DESC` 字典序。

#### 6.2 [已修复] mcp batch import 不校验 type
- **位置**：`devopsRoutes.ts` POST `/api/admin/mcp/batch`
- **修复**：对每个 item 校验 type 在 `['sse','stdio']` 内，否则回退 sse。

#### 6.3 [已修复] AdminMcp 编辑态死分支
- **位置**：`AdminMcp.tsx` handleOpenEdit
- **修复**：合并 `if (hasKeys) {} else {}` 两个相同分支为单行。

#### 6.4 [已修复] AdminSkills 单条保存复用 batchSaving 状态
- **位置**：`AdminSkills.tsx`
- **修复**：新增独立 `saving` 状态给单条保存用，Modal confirmLoading 改用 `saving`。

#### 6.5 [已修复] usage 重复请求 listMemberDashboard
- **位置**：`EnterpriseUsagePage.tsx`
- **修复**：`loadStats` 复用 `membersState.data`，不再独立请求成员列表。

#### 6.6 [已修复] Milestone 无 update/delete 端点
- **位置**：`cteamRoutes.ts`、`cteamMilestoneService.ts`、`milestoneRepository.ts`
- **修复**：新增 PATCH/DELETE `/api/admin/milestones/:id` 端点 + service/repository 方法，POST/PATCH/DELETE 加 `requireDevopsAdmin`。

## 验证状态
- `tsc --noEmit` exit 0（全部批次通过）。
- 未运行 lint/test/build（按用户要求"不分日期"快速推进，最终验证由用户桌面端 `npm run restart` 实测）。
- 运行时需桌面端实测：MCP toggle 不丢凭证、requirements 越权被拒、团队 owner 保护、邀请码 preview 不泄露租户名、CMeas 进度条、审计日志写入。

## 涉及文件汇总（本轮）

### 追加改动 — 复查发现的新 bug 修复

#### N1. [已修复] 桌面端开启系统管理员开关实际写入 org_admin
- **位置**：`src/common/adapter/ipcBridge.ts`、`src/process/bridge/taskBridge.ts`、`src/renderer/utils/kanbanApi.ts`
- **问题**：桌面端 IPC 通道 `adminUsers.setRole` 的 role 类型只有 `'user' | 'admin'`。`handleSetSystemAdmin` 传 `system_admin` 时，kanbanApi 把它映射为 'admin'，taskBridge 又映射为 'org_admin'。前端显示"系统管理员已开启"但后端实际存 org_admin，用户没有 system_admin 权限。
- **修复**：IPC 通道 role 类型扩展为 `'user' | 'admin' | 'system_admin'`；taskBridge 正确识别 system_admin；kanbanApi 直传 system_admin 不再降级映射。

#### N2. [已修复] 关闭系统管理员开关会把 org_admin 误降为 member
- **位置**：`src/renderer/pages/users/index.tsx` handleSetSystemAdmin
- **问题**：关闭开关时 `nextRole = 'member'`，丢失 org_admin 角色。
- **修复**：改为 `'org_admin'`，关闭系统管理员后回到组织管理员。

#### N3. [已修复] 系统管理员政策文案绕
- **位置**：`src/renderer/pages/users/index.tsx` + `zh-CN/settings.json`
- **修复**：文案改写为"角色说明：系统管理员可进入企业后台的全部功能（含邀请码、企业认证、运行时等系统级配置）；组织管理员只能管理成员（增删改角色），看不到系统级后台入口。"

#### N4. [已修复] 个人版使用统计页仍调用企业版接口
- **位置**：`src/renderer/pages/enterprise/EnterpriseUsagePage.tsx`
- **问题**：个人版虽不渲染成员看板和资源卡，但 `membersState` 和 `loadStats` 仍会调用 `listMemberDashboard`/`listPipelines` 等企业版接口，浪费请求且语义不对。
- **修复**：`showEnterprisePanels=false` 时 membersState 用空 loader、loadStats 直接返回默认值，不发请求。

#### N5. [已实现] 个人版"使用统计"入口
- **位置**：`src/renderer/pages/settings/components/SettingsSider.tsx`、`SettingsPageWrapper.tsx`、`Router.tsx`
- **实现**：个人版在设置侧栏「系统」后追加「使用统计」项（Analysis 图标），点击跳转 `/settings/usage` → `<Navigate to='/enterprise/usage' replace />`。企业版不显示此入口（从企业后台导航进入）。

#### N6. [已修复] 侧边栏「企业后台」按钮冗余
- **位置**：`src/renderer/components/layout/sidebarNav.tsx`、`SidebarModuleNav.tsx`
- **问题**：侧边栏有「企业后台」按钮，但左下角身份面板（WorkspaceIdentityPanel）的菜单里已有「企业团队版管理后台」入口，两者重复。
- **修复**：NavItem 类型加 `hidden?: boolean` 字段；侧边栏「企业后台」条目标 `hidden: true`；SidebarModuleNav 过滤掉 hidden 条目。路由激活逻辑（standalonePrefixes）保留 `/enterprise` 不变。

## 涉及文件汇总（本轮）

### 追加改动 — 删除 3 个隐藏路由 + 使用统计开放给个人版

#### 删除隐藏路由 ctest/cflow/cagent
- **位置**：`enterpriseRoutes.ts`、`enterpriseNav.ts`、`paths.ts`、`Router.tsx`、`sidebarNav.tsx`、`EnterpriseHome.tsx`
- **原因**：cagent 只是 `<Navigate>` 重定向到超级助手（价值不大）；ctest/cflow 虽有真实页面但功能与 Issues 看板重叠且数据缺陷多，用户决定删除。
- **影响**：`/enterprise/ctest`、`/enterprise/cflow`、`/enterprise/cagent` 路由不再存在；导航不再显示；EnterpriseHome 的能力卡片移除这 3 项。CTestManagement.tsx 和 CFlowBoard.tsx 文件保留（未删除物理文件，避免破坏可能的引用），只是不再挂载路由。

#### 使用统计开放给个人版
- **位置**：`EnterpriseUsagePage.tsx`、`adminRoutes.ts` 的 `/api/admin/agent-token-usage`
- **原因**：使用统计的核心是 Token/模型用量统计（数字员工 Token 排行），对个人版有价值。成员看板和资源统计卡是企业专属，个人版隐藏。
- **改动**：
  - 页面引入 `useEditionFeatures.isEnterpriseEdition`，新增 `showEnterprisePanels` 标志。资源统计卡和成员看板用 `showEnterprisePanels` 包裹，个人版不渲染。
  - Token 排行卡片去掉 `isAdmin` 限制，个人版也显示。
  - 后端 `/api/admin/agent-token-usage` 移除 `isEnterpriseAdminRole` 403 检查，任意已认证用户可调（按 `resolveAdminTenantId(req)` 聚合，个人版 tenant_id='default' 只看自己会话）。
- **待办**：个人版入口未加（需要决定放哪——建议设置页或标题栏用户菜单）。

| 文件 | 改动 |
|------|------|
| `src/process/webserver/routes/devops/cciRoutes.ts` | run 路由加 requireDevopsAdmin |
| `src/process/services/pipeline/PipelineService.ts` | executeCommand 加 cwd + env 过滤 |
| `src/process/webserver/routes/devopsRoutes.ts` | SSRF 防护 + requirements 鉴权 + MCP toggle 端点 + 审计日志 + batch type 校验 |
| `src/renderer/pages/admin/AdminMcp.tsx` | toggle 改专用端点 + 死分支清理 |
| `src/renderer/utils/enterpriseApi/modules.ts` | 新增 toggleMcpRegistryEnabled |
| `src/process/webserver/routes/adminRoutes.ts` | 跨租户校验 + owner 保护 + is_online 心跳 + 成员排序 + agent-token-usage 放开 |
| `src/renderer/pages/login/index.tsx` | 移除密码存储 |
| `src/common/auth/oauthCallbackUri.ts` | localhost-only 回退 |
| `src/common/auth/enterpriseRoutes.ts` | security/usage 改 admin + 删除 ctest/cflow/cagent |
| `src/process/webserver/routes/authRoutes.ts` + `oauthLoginHelpers.ts` + `AuthService.ts` + `UserRepository.ts` + `TokenMiddleware.ts` | admin 角色统一归一化 |
| `src/process/webserver/auth/enterpriseJoinService.ts` + `src/common/types/enterpriseJoin.ts` + `src/common/adapter/ipcBridge.ts` + `src/renderer/utils/enterpriseJoinApi.ts` + `WebuiJoinEnterprisePanel.tsx` | 邀请码 preview 不泄露 |
| `src/renderer/pages/admin/CMeasDashboard.tsx` | 三连击修复 |
| `src/process/webserver/auth/auditLogService.ts` | 新增 recordDevopsAudit + DEVOPS_AUDIT_ACTIONS |
| `src/renderer/hooks/enterprise/modules/useEnterpriseAsyncData.ts` | 竞态 + 卸载保护 |
| `src/renderer/pages/admin/MilestoneView.tsx` | 时区修复 |
| `src/process/services/database/repositories/devops/valueStreamRepository.ts` | LIMIT 100→1000 |
| `src/renderer/pages/admin/AdminPipelineEditor.tsx` | 解析 stages_status_json |
| `src/process/services/database/repositories/devops/codeRepoRepository.ts` | 排除 credential_id |
| `src/renderer/pages/admin/CCodeRepoList.tsx` + `CPackArtifactRepo.tsx` | 删除二次确认 |
| `src/renderer/pages/admin/CTestManagement.tsx` | 删双重加载 |
| `src/renderer/pages/admin/AdminTeamRuntimes.tsx` | 错误展示 |
| `src/renderer/pages/admin/components/TeamAddMemberModal.tsx` + `AdminTeams.tsx` | LDAP resolve 顺序 |
| `src/renderer/pages/admin/AdminSkills.tsx` | 独立 saving 状态 |
| `src/renderer/pages/enterprise/EnterpriseUsagePage.tsx` | 个人版只显示 Token 排行 |
| `src/renderer/pages/enterprise/enterpriseNav.ts` + `paths.ts` + `Router.tsx` + `sidebarNav.tsx` + `EnterpriseHome.tsx` | 删除 ctest/cflow/cagent |
| `src/process/webserver/routes/devops/cteamRoutes.ts` + `cteamMilestoneService.ts` + `milestoneRepository.ts` | Milestone PATCH/DELETE |

---

# 追加记录 — 2026-06-26（企业版部署状态机 / 使用统计 / 工作空间 + 踩坑）

分支 `fix/enterprise-bootstrap-deployment`。承接 6-25 企业审查,本轮聚焦"全新环境企业版能否转起来"+ 使用统计卡死 + 工作空间。

## 一、完成的功能

### 1. 企业版初始化链路修复（4 项）
- **① 全新安装 admin 卡 `member` 死锁**：初始化顺序 `initSchema → runMigrations → ensureSystemUser`,全新库跑 migration 时占位行还不存在 → 之后插占位行落 schema 默认 `member`,`initializeDefaultAdmin` Case 2 又不设 role → admin=member → 认领/建企业/进后台全锁死。修复 `database/index.ts` `ensureSystemUser`:INSERT 显式 `role='org_admin'` + 自愈 UPDATE(已坏 member 提为 org_admin)。
- **② 桌面认领系统管理员**：原走 HTTP(桌面无登录态 401)。新增 IPC `webui.claimSystemAdmin`,桌面走 IPC、浏览器走 HTTP。认领入口前置到 `EnterpriseBootstrapBanner`(概览页 + 桌面占位页)。
- **③ 建企业**：`WebuiJoinEnterprisePanel` 放开 `embedded` 创建 tab;`createEnterpriseTenant` 建完**保持 system_admin**(原会降级)。
- **④ 飞书 SSO 死循环兜底**：无企业 tenant 时 JIT 加不进 → 回跳逻辑把未加入用户送回 `/enterprise/join` → 循环。修 `resolveOAuthPostLoginRedirectPath`:登录成功但无企业 → 落 `/sessions`,不弹回登录页。测试 `enterpriseRoles.oauthRedirect.test.ts`。

### 2. 客户端/服务器部署状态机
- 配置 `webui.deploymentRole`(**默认 client**) + `webui.enterpriseServerUrl`。创建企业=变 server+system_admin;切回 client=`WebuiService.demoteToClient` **归档不删**(导出 JSON 到 `userData/enterprise-archive/`,再瓦解本机企业、降级)。
- 客户端连远程靠 `getWebuiAdminBrowserOrigin` client 模式返回远程地址;**故意不动 `getWebuiApiBaseUrl`**(整台机后端入口,改它=远程认证+跨域 cookie 深水区)。
- 设置入口 `EnterpriseDeploymentModeCard`(设置→WebUI) + 心跳 `useEnterpriseServerHeartbeat`(client 每 30s no-cors ping,显示在线/离线)。容错只做心跳:离线兜底已被"降级仍可用个人版"覆盖、备份导入已被"归档不删"覆盖(用户决策)。

### 3. 使用统计（个人版也可用 + 卡死修复 + 增强）
- 入口:`Router.tsx` 把 `/settings/usage` 从 `Navigate /enterprise/usage`(被企业 layout 拦)改为直接渲染 `EnterpriseUsagePage`。
- **卡死修复**:桌面 `listAgentTokenUsage` 改走 IPC `webui.getAgentTokenUsage`(绕过 HTTP admin API 无认证态挂起)。
- **增强**:Token 排行加 模型/次数/成功率/失败率(`agentTokenUsage.ts` 聚合 `conversations.model` + `messages.status='error'`)。
- **卡死真因(关键)**:`conversations.model` 实际存的是**整个 provider 配置大 JSON(含 apiKey、modelHealth)**,原样进 IPC payload 几 MB → 卡死 + **泄露 apiKey**。改 `parseModelLabel` 只取 `useModel`,payload 骤降。

### 4. 工作空间默认目录
- `initAgent.ts`:未指定 workspace 时默认从散落 userData 根目录的 `xxx-temp-<ts>` 改为集中放 `userData/workspaces/`,去掉各 agent `-temp-` 命名。

## 二、踩的坑（重要教训）
1. **诊断用错环境数据**：飞书死循环先后猜"无企业"→"redirectUri IP 不一致"→才定位真因。我读本机库、用户跑**另一台机**的库,且沙箱 PowerShell `$APPDATA` 会重定向到 `Local\Packages\Claude_*`——**多台机/沙箱视图极易混淆,诊断前先确认数据来自哪台机**。
2. **"数据丢了"是误判**：用户重装后会话变少,实为两台机数据不同 + 沙箱差异,userData 库其实完好。
3. **"装了没新功能"真因**：用户把 `out\win-unpacked\1onecode.exe`(打包**中间产物**)当测试入口直接双击,开了 6 个进程**占用 win-unpacked** → `dist:win` 反复 `EPERM`。教训:测试用 `npm start`(dev)或装正式 `.exe`,**别跑 out\win-unpacked**;打包前 `Get-Process -Name 1onecode | Stop-Process`,必要时删整个 `out/` 强制全量重编译。
4. **使用统计卡死**：根因不是 SQL 慢(实测 0.03s),是 `conversations.model` 大 JSON 进 payload。**别假设列存的是字面值**。
5. **频繁 bump+打包**：1.23.5→1.23.10 打了多次,效率低。教训:攒齐一批改动再 bump 一次出包。

## 三、commit（分支 `fix/enterprise-bootstrap-deployment`）
- `1a8caa9` 企业版初始化链路修复与客户端/服务器部署模式
- `1471ece` 个人版使用统计改走 IPC（1.23.6）
- `4648b8d` 使用统计 Token 排行增加模型/次数/成功率/失败率
- `00fede8` 1.23.7
- `2d39dc8` 客户端心跳检测（1.23.8）
- `d5fb62d` 1.23.9（工作空间默认目录）
- `4ff98d3` 使用统计 model 列只取真实模型名,修卡死与 apiKey 泄露（1.23.10）

## 四、待办 / 下一步
- 全新编译打 1.23.10 包验证:个人版使用统计不卡 + 四列、设置→WebUI 部署开关 + 心跳、飞书登录不死循环、工作空间落 `userData/workspaces/`。
- 数据故障转移走"备份+导入"(用户拍板,不做 P2P),尚未实现。
- 内网单服务器探测/广播:暂用手动开关 + 填地址,未做自动发现。

---

# 追加记录 — 2026-06-26 下午（kimi-k2-6 助手工具调用修复 + skill 预注入）

分支 `fix/enterprise-bootstrap-deployment`。本轮排查全局设置助手无法正常工作的问题，并实现 skill 自动预加载。

## 一、产品已有能力：会话导出

用户询问是否支持将会话导出为 PDF/MD 到指定目录。

**答：已有，但格式是 ZIP 包而非单文件 PDF。** 具体实现位于：

- **UI 入口**：历史会话列表右键菜单「导出」按钮，也支持批量勾选后批量导出
- **核心 hook**：`src/renderer/pages/conversation/GroupedHistory/hooks/useExport.ts`
- **导出内容**：每个会话打包为一个 ZIP，内含：
  - `{topic}/conversation/conversation.json` — 完整消息 JSON
  - `{topic}/conversation/conversation.md` — Markdown 格式对话内容（已实现）
  - `{topic}/workspace/` — 会话工作区文件（如生成的 xlsx/docx/png 等）
- **目标目录**：弹出目录选择器，默认桌面；WebUI 环境弹前端目录选择组件
- **批量导出**：多会话合并进同一 ZIP（`batch-export-{timestamp}.zip`）

目前 **不支持直接导出单文件 PDF**，如需 PDF 需用户自行打印 Markdown 或浏览器另存。

## 二、kimi-k2-6 全局助手不可用问题分析

### 根因

kimi-k2-6 在调用工具时，对所有工具调用均生成空参数 `{}`（不传任何参数），而 aioncli-core 的 JSON Schema 验证会拒绝缺少必填字段的调用。

两种典型错误（在 View Steps 中可见）：

| 工具 | 必填字段 | 实际参数 | 错误 |
|------|---------|---------|------|
| `activate_skill` | `name` | `{}` | `params must have required property 'name'` |
| `ReadFile` | `file_path` | `{}` | `params must have required property 'file_path'` |

**影响范围**：所有 `presetAgentType: 'gemini'` 的助手预设（财务建模助手、Excel 助手、Word 助手、PPT 助手等），当用户选择 kimi-k2-6 模型时，skill 无法通过 `activate_skill` 加载，导致助手无效。

### 已有机制

- `enabledSkills`（`defaultEnabledSkills` 在 AssistantPreset config）：把 skill 目录 symlink 到 `.gemini/skills/`，供 SkillManager 发现
- `activate_skill` 工具：模型调用它来加载 skill 内容到对话上下文
- `LOAD_SKILL` 文本检测（`GeminiAgentManager.ts:902-912`）：检测模型文本输出中 `[LOAD_SKILL:...]`，直接注入内容，但同样依赖模型能正确生成特定格式文本

kimi-k2-6 空参数问题需在模型层面修复，短期内无解。

## 三、修复 1：视觉模型正则匹配 kimi-k2-6 格式

**文件**：`src/process/services/visionModelResolver.ts`

**问题**：`VISION_MODEL_HINT` 正则中 kimi 的分支为 `kimi-(?:latest|k2\.?[5-9]|thinking)`，其中 `k2\.?[5-9]` 匹配 `k2.6`（点号）但**不匹配 `k2-6`（连字符）**。

**修复**：将 `k2\.?[5-9]` 改为 `k2[.-]?[5-9]`，兼容带点和带连字符的版本命名。

```ts
// 修复前
kimi-(?:latest|k2\.?[5-9]|thinking)

// 修复后
kimi-(?:latest|k2[.-]?[5-9]|thinking)
```

## 四、修复 2：gemini 助手 skill 内容预注入 userMemory

**文件**：`src/process/agent/gemini/index.ts`

**方案**：在 `GeminiAgent.init()` 中，`presetRules` 注入 userMemory 之后，立即将 `enabledSkills` 的完整内容（通过 `loadSkillsContent()`）也注入 userMemory，使模型在会话开始前就持有 skill 内容，**不再需要调用 `activate_skill`**。

**关键代码位置**（~605 行）：
```ts
import { loadSkillsContent } from '@process/utils/initStorage';

// 在 init() 里 presetRules 注入之后追加：
if (this.enabledSkills && this.enabledSkills.length > 0) {
  const skillsContent = await loadSkillsContent(this.enabledSkills);
  if (skillsContent) {
    const currentMemory = this.config.getUserMemory();
    const skillsSection = `[Pre-loaded Skills]\n${skillsContent}`;
    const combined = currentMemory ? `${currentMemory}\n\n${skillsSection}` : skillsSection;
    this.config.setUserMemory(combined);
  }
}
```

**`loadSkillsContent` 读取路径**（按优先级）：
1. `config/builtin-skills/_builtin/{skillName}/` — 自动内置 skills
2. `config/builtin-skills/{skillName}/` — 打包内置 skills（app 启动时从 resources/ 同步）
3. `config/skills/{skillName}/` — 用户自定义 skills

读取内容包含 SKILL.md 及 `runtimeFiles`（如 creating.md 等引用文件），带缓存。

**效果**：所有有 `enabledSkills` 的预设助手（财务建模助手等）从会话第一条消息起就拥有完整 skill 内容，kimi-k2-6 无需调用任何工具即可按 skill 指导执行任务。

## 五、踩的坑

1. **CONTEXT.md 已有 6-26 的记录段但不完整**：文件末尾已有"追加记录 — 2026-06-26"的标题，本次是在该段追加。

2. **visionModelResolver 正则要仔细看**：正则中 `\.?` 匹配"0或1个点"，但 kimi 实际用连字符 `k2-6`——两者差一个字符，容易漏看。修改为 `[.-]?` 同时兼容两种格式。

3. **kimi-k2-6 空参数问题无法在应用层完美解决**：对于 `ReadFile` 调用空参数（模型不知道要读哪个文件），根本无法猜测参数，只能靠 skill 预注入让模型先有完整指导再行动，减少模型需要调用文件读取工具的场景。

4. **skill 预注入会增加上下文长度**：`officecli-financial-model` skill（含 creating.md）大约几千 token，每个会话多消耗一次系统上下文。对于 kimi-k2-6（超大上下文窗口）影响不大。

## 六、验证状态

- `tsc --noEmit` exit 0（无类型错误）
- 运行时验证：需 `npm run restart` 后，用 kimi-k2-6 开启财务建模助手，发送任务，确认 View Steps 中不再出现 `activate_skill params must have required property 'name'` 错误

---

# 追加记录 — 2026-06-27（使用统计卡死根因修复 + 网关 Token 面板 + HTML→PDF 导出）

分支 `fix/enterprise-bootstrap-deployment`。

## 一、使用统计页面卡死根因定位与修复

### 根因（React 无限 render 循环）

**文件**：`src/renderer/pages/enterprise/EnterpriseUsagePage.tsx`

个人版（`showEnterprisePanels=false`）进入使用统计页面后立即完全卡死，无法点击、无法输入，原因是：

```tsx
// 错误写法：每次 render 创建新的 async 函数引用
useEnterpriseAsyncData(
  showEnterprisePanels ? listMemberDashboard : async (): Promise<MemberDashboardRecord[]> => [],
  [],
  ...
)
```

`async () => []` 是内联函数，每次 render 产生新引用 → `useEnterpriseAsyncData` 的 `useCallback([..., loader])` 随之失效 → `useEffect([reload])` 每次 render 后重新触发 → `setLoading(true/false)` → 触发新 render → **无限循环，JS 主线程卡死**。

**修复**：将空 loader 提升为模块级稳定常量：

```tsx
const EMPTY_MEMBERS: MemberDashboardRecord[] = [];
const emptyMemberLoader = async (): Promise<MemberDashboardRecord[]> => EMPTY_MEMBERS;

// 在组件内：
showEnterprisePanels ? listMemberDashboard : emptyMemberLoader  // 稳定引用，不再无限循环
```

## 二、Electron frameless 窗口输入无法点击修复

**文件**：`src/renderer/styles/layout.css`、`src/renderer/pages/admin/components/AdminPageWrapper.tsx`

之前 `.settings-page-wrapper` 有 `no-drag` + `pointer-events: auto !important` 保护，但 Admin 页面（使用统计、企业后台）走 `AdminPageWrapper`，缺乏此保护。

**修复**：
- `layout.css`：给 `.arco-layout-content, .arco-layout-content *` 全局加 `-webkit-app-region: no-drag`（覆盖所有中间 wrapper 元素），对 input/button/select 加 `pointer-events: auto !important`
- `AdminPageWrapper.tsx`：加 `style={{ WebkitAppRegion: 'no-drag' }}`

## 三、LiteLLM 网关 Token 用量面板

**新文件**：`src/renderer/pages/enterprise/GatewayUsagePanel.tsx`

新增独立面板，填入 LiteLLM 网关地址 + API Key 后拉取 `/global/spend/models`，展示近 30 天各模型 Token/费用/占比/请求数排行。关键设计：
- `fetchData` 加 `AbortController` 15s 超时，防止网关不可达时 `loading=true` 永久卡死
- 首次无 localStorage 存储时展示填写表单（不发请求）；有保存地址时自动拉取
- `useEffect([savedUrl, savedKey, editing, fetchData])` 条件触发，无 URL 时不发请求

接入位置：`EnterpriseUsagePage.tsx` 使用统计页底部增加网关 Token 用量卡片（Card 背景用 `--color-bg-1` 与页面主题一致）。

## 四、HTML → PDF 导出功能（主进程 Electron 方案）

**新文件**：`src/process/bridge/exportBridge.ts`

利用 Electron 内置 `webContents.printToPDF()`，通过 `data:text/html;...` URL 加载 HTML 到隐藏 BrowserWindow，导出 PDF。无需 puppeteer 等外部依赖。

**改动文件**：
- `src/common/adapter/ipcBridge.ts` — 新增 `exportApi.htmlToPdf` IPC 通道
- `src/process/bridge/index.ts` — 注册 `initExportBridge()`
- `src/process/bridge/exportBridge.ts` — 新文件，实现 printToPDF 逻辑
- `src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel.tsx` — HTML 预览面板加"导出 PDF"回调
- `src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewToolbar.tsx` — 工具栏加 PDF 图标按钮（仅 HTML 类型显示）
- `src/renderer/components/Markdown/CodeBlock.tsx` — `html` 代码块头部加 PDF 导出图标
- `src/renderer/services/i18n/locales/en-US/preview.json` — `exportPdf/exportPdfSuccess/exportPdfFailed` 键
- `src/renderer/services/i18n/locales/zh-CN/preview.json` — 同上中文

## 五、使用统计数据增强

**文件**：`src/process/services/usage/agentTokenUsage.ts`、`src/process/services/database/migrations.ts`

Token 排行新增 模型名（从 conversations.model JSON 中 parseModelLabel 提取）、对话次数、成功率、失败率统计，SQL 用 `json_extract` + `JOIN messages` 计算。

`useGuidSend.ts`：aionrs 分支预热 warmup 从 navigate 前调整为更早触发，减少首发延迟。

## 六、验证状态

- 使用统计页面进入不再卡死（用户实测通过）
- `npm run restart` 成功启动，无编译错误
- 待验证：PDF 导出按钮实际生成 PDF；网关面板填写后拉取数据

---

# 追加记录 — 2026-06-29（HTML→PDF 修复 + officecli 技能同步 + aionrs 技能注入 + 技能缓存失效）

## 背景

用户报告两类问题：1) 会话框生成的 HTML 文件导出 PDF 格式错乱；2) 全局设置「技能中心」里表格助手、财务建模助手等技能有 BUG。排查中发现 aionrs（用户主力会话 agent）的技能完全不生效，以及技能缓存永不失效两个深层问题。一并修复。

## 一、HTML→PDF 格式错乱

**文件**：`src/process/bridge/exportBridge.ts`

**根因**：
- `printToPDF` 没禁用页眉页脚 → Chromium 默认在 PDF 顶部/底部加 data: URL（极长且丑）、日期、页码
- `loadURL` 返回后立刻打印，没等异步资源（web 字体、CDN CSS、图片）加载完 → 字体没加载就用 fallback 渲染，布局错乱
- 大 HTML 用 `encodeURIComponent` 编码 data URL，有长度/编码隐患
- HTML 片段缺 DOCTYPE 时进怪异模式

**修复**：
- `displayHeaderFooter: false` + `margins: { marginType: 'none' }`（边距交给 HTML 里的 `@page { margin: 12mm }` 控制）
- `preferCSSPageSize: true` 尊重 HTML 里的 `@page` 规则
- base64 data URL 替代 encodeURIComponent
- 新增 `normalizeHtmlForPdf`：缺 DOCTYPE/html 标签时补全，注入 CJK 友好的默认字体
- `loadURL` 后等 `document.fonts.ready`（最多 1.5s）+ 2s 硬超时，再 printToPDF

## 二、officecli 在 Windows 上 command not found

**文件**：`src/process/utils/shellEnv.ts`

**根因**：`getWindowsExtraToolPaths()` 列表里没有 officecli 安装目录 `%LOCALAPPDATA%\OfficeCli`。Electron 从快捷方式启动时子进程 PATH 不含该目录 → agent 跑 `officecli` 报 command not found。SKILL.md 里的 bash 检查命令（`if ! command -v officecli`）在 Windows PowerShell 上也跑不了。

**修复**：在 `getWindowsExtraToolPaths()` 加上 `path.join(localAppData, 'OfficeCli')`。所有走 `getEnhancedEnv()` 的子进程（gemini/aionrs/acp worker 等）都能找到 officecli。

## 三、officecli 技能内容严重过时 + 同步最新版

**根因**：1ONE 仓库里的 officecli 技能是 v1.0.23/v1.0.24，但本机 officecli 已是 v1.0.125，差 100+ 版本。officecli 自己会刷新 Codex/Cursor/OpenClaw 宿主的技能，但不知道 1ONE 的技能目录（`src/process/resources/skills/officecli-*`），所以 1ONE 的技能不会自动同步。技能教的命令语法跟实际 officecli 已不匹配，是 PPT/Word 产物坏的主要嫌疑。另有坏链接：`../xlsx/SKILL.md`（应 `../officecli-xlsx/SKILL.md`）、`../docx/creating.md`（应 `../officecli-docx/creating.md`）。

**修复**：
- 删除 8 个过时技能目录（officecli-xlsx/pptx/docx/pitch-deck/academic-paper/data-dashboard/financial-model 旧多文件结构 + 旧 morph-ppt）
- 删除 3 个 `_deprecated-*` 目录（更老的废弃技能，零代码引用）
- 从 `~/.claude/skills/`（officecli v1.0.125 自动安装的最新版）复制 10 个最新技能到仓库：officecli-xlsx/pptx/docx/pitch-deck/academic-paper/data-dashboard/financial-model/word-form + morph-ppt（含 reference 子目录）+ morph-ppt-3d
- 新版技能改用 `officecli help <element>` 自描述命令，不再硬编码所有语法，不会因 officecli 升级而过时
- 安装命令改成跨平台：`irm https://d.officecli.ai/install.ps1 | iex`（Windows PowerShell）

## 四、aionrs 助手技能完全不生效（严重 BUG）

**文件**：`src/process/task/AionrsManager.ts`

**根因**：aionrs 是默认主力 agent（kimi/qwen/deepseek/doubao 等 OpenAI 协议模型），但 `AionrsManager.sendMessage` 完全不读 `extra.enabledSkills`，也不调任何技能注入函数。`AionrsAgent`/`OneAgent` 的 `buildSystemPrompt` 只注入 `presetRules`。对照：Gemini 走原生 SkillManager（symlink + worker 内 `loadSkillsContent` 预注入 userMemory）；ACP/NanoBot/OpenClaw 走 `applyAgentToolkitFirstMessage`（首条消息注入技能索引）。aionrs 两条路都不走。用户在技能中心给 aionrs 助手启用任何技能，会话中技能内容从不注入。

**修复**（用户选定"首条消息注入全文"方案，仿 gemini 预注入）：
- `AionrsManagerData` 加 `enabledSkills?: string[]`（`c.extra.enabledSkills` 早已透传进 data，只是类型没声明）
- 新增实例字段 `pendingSkillsInjection: string | null`
- 构造函数里 fire-and-forget 调 `loadSkillsInjection(enabledSkills)` 预加载技能全文（异步，不阻塞 worker 启动）
- `sendMessage` 开头一次性消费：把技能全文包成 `[Pre-loaded Skills]\n...\n[User Request]\n` 前缀，**同时写到 `input` 和 `agentPrompt`**（避开"worker 发 agentPrompt 不发 input"的坑），注入后置 null
- 后续消息不重注入（跟 gemini 预注入 userMemory 一致，避免 token 膨胀）

**效果**：aionrs 助手首条用户消息会把所有启用技能的 SKILL.md 全文注入到 prompt 前缀，模型从第一条起就持有完整技能内容，不依赖 `activate_skill` 工具调用（绕开 kimi-k2-6 空参数问题）。

## 五、技能缓存永不失效（BUG 2）

**文件**：`src/process/bridge/fsBridge.ts`

**根因**：
- `loadSkillsContent` 的 `skillsContentCache` 是模块级 Map，`clearSkillsCache` 定义了但**全仓无人调用**
- `AcpSkillManager.resetInstance` 只在 enable/disable SkillsMarket 两处调用
- `importSkill` / `importSkillFromUrl` / `importSkillWithSymlink` / `deleteSkill` 都不清缓存
- 用户导入/删除/更新技能后，已建会话和新建会话仍用旧内容（`skillsContentCache` 命中旧值，`AcpSkillManager` 单例 `initialized=true` 跳过重新扫描），必须重启 app 才生效

**修复**：
- 新增 `invalidateSkillCaches()` helper：同时调 `clearSkillsCache()` + `AcpSkillManager.resetInstance()`
- `importSkillDirectory`（三个 import IPC handler 的共用函数）真正写入成功后调 `invalidateSkillCaches()`（already exists 路径不清，因为文件系统未变）
- `deleteSkill` 成功后调 `invalidateSkillCaches()`
- 顺带把 enable/disable SkillsMarket 两处也换成统一 helper（之前只 reset AcpSkillManager，漏了 clearSkillsCache）

## 六、已发现未修（待定夺）

**BUG 3（轻）**：`src/process/utils/initStorage.ts:1031` 的 `needsSkillsMigration` 条件 `(!existing.enabledSkills || existing.enabledSkills.length === 0)` 把"用户主动清空（`[]`）"和"从未配置（`undefined`）"等同处理。新装未触发过 migration 时，用户清空内置助手技能后重启，可能被重新补回内置默认。需产品决策：清空是否应持久化。

## 七、验证状态

- `tsc --noEmit` exit 0
- `vitest run`：9 文件失败 / 10 测试失败 / 3648 通过——与干净 main 基线完全一致，零回归（既存失败均为 enterprise/oauth/devops 相关，与本次改动无关）
- 运行时需 `npm run restart` 桌面端实测：HTML 导出 PDF、officecli 技能产物、aionrs 助手技能注入生效、技能导入/删除后即时生效
- 按交付约定，影响运行行为，需出新的 Windows 安装包（`npm run dist:win`）才生效

---

# 追加记录 — 2026-06-29 下午（aionrs 注入 web 搜索 MCP）

## 背景

用户发现 aionrs 会话里"搜东西"质量差，只是去百度等搜索引擎。根因诊断：

- aionrs 是独立 Rust 二进制，工具仅来自它自己的全局 `config.toml`（`aionrs --config-path` 路径）。
- aionrs 系统提示词（`envBuilder.ts:130`）明写 "you have no web-search tool, tell the user clearly instead of guessing"。
- 内置 `one-web-tools` MCP（提供 `one_web_search` 百度/Bing/DDG + `one_web_fetch`）**只注入给 ACP**（`acp/index.ts:1691` 启动时强制注入）和 Gemini，**aionrs 没被注入**。
- 自动同步路径 `syncAgentToolkitMcpToCliAgents`（`syncCliMcp.ts`）有两个门槛把 aionrs 挡在外面：① 前置条件 `toolkit.enabled && toolkit.codegraphEnabled`；② agents 列表来自 `acpDetector.getDetectedAgents()`，而 `acpTypes.ts:117` 明确把 `aionrs` 排除在 `POTENTIAL_ACP_CLIS` 之外。

所以用户看到的"搜百度"是模型用 bash `curl` 抓百度 HTML 或直接编链接，不是真正的工具调用。

## 方案选择

讨论了四条路：
1. **把内置 `one-web-tools` 注入 aionrs**（本轮采用）——零外部依赖、零用户配置，复用 ACP 同款脚本。
2. 接 Tavily/Brave 等搜索 API MCP——需用户 key，有技术/金钱门槛，暂缓。
3. 深度研究类编排——非独立方案，是 1 或 2 之上的多轮编排，aionrs 拿到工具后模型自己会做。
4. provider grounding 透传（Gemini/OpenAI/Perplexity）——碎片化严重，每 provider 字段不同且网关不一定透传，单独评估。

用户决策：先做 1。

## 修复

### 1. 新增 `ensureAionrsBuiltinMcp()`

**新文件**：`src/process/services/agentToolkit/syncAionrsBuiltinMcp.ts`

复用 `AionrsMcpAgent.installMcpServers()`（`OneCmdAionrsMcpAgent.ts`，已封装"读 config.toml → 按 name 覆盖 → 写回"，幂等）把 `one-web-tools`（`command: 'node'` + `getBuiltinMcpScriptPath('builtin-mcp-web-tools')`，跟 ACP 同一个脚本）写进 aionrs 全局 `config.toml`。失败只 `console.warn`，不阻塞启动。

### 2. 在 `initStorageDeferred` 调用

**文件**：`src/process/utils/initStorage.ts` `initStorageDeferred`

在 `ensureBuiltinMcpServers()` 之后 `void ensureAionrsBuiltinMcp()`。选这里而非 `agentToolkit/bootstrap.ts`（plan 原方案）的理由：bootstrap 有 `config.enabled`（agentToolkit 总开关）门槛，而 aionrs web 搜索是基础能力，不应受 agentToolkit 开关控制；放 initStorageDeferred 跟 `ensureBuiltinMcpServers` 并列语义更清晰，主进程早期执行、不阻塞 worker 会话启动。

### 3. 修改 aionrs 系统提示词

**文件**：`src/process/agent/aionrs/envBuilder.ts` `neutralSystemPrompt`（非 anthropic provider 走这条）

删掉 "you have no web-search tool"，改成告知模型有 `one_web_search` / `one_web_fetch`，遇到实时信息/外部数据主动调用、不要瞎编。

**限制**：anthropic provider 走 aionrs 二进制自带的默认提示词（`neutralSystemPrompt` 只对非 anthropic 生效），这部分改不到。先聚焦非 anthropic（custom/new-api/gemini 等大多数用户）。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/process/services/agentToolkit/syncAionrsBuiltinMcp.ts` | 新增 `ensureAionrsBuiltinMcp()` |
| `src/process/utils/initStorage.ts` | `initStorageDeferred` 调 `ensureAionrsBuiltinMcp()` |
| `src/process/agent/aionrs/envBuilder.ts` | 系统提示词改为引导使用 `one_web_search`/`one_web_fetch` |

## 验证状态

- `tsc --noEmit` exit 0
- `oxlint` 0 error（1990 warnings 为仓库既有，与本次无关）
- 运行时需 `npm run restart` 桌面端实测：aionrs 会话（非 anthropic provider）问实时信息，确认模型调用 `one_web_search` 工具而非 bash curl 百度；检查 aionrs 全局 config.toml 里 `[mcp.servers.one-web-tools]` 存在
- 按交付约定，影响运行行为，需出新的 Windows 安装包才生效

---

# 追加记录 — 2026-06-29 晚（HTML→PDF 动态等待 + Office→PDF 导出 + aionrs export_to_pdf MCP 工具）

## 背景

用户报告 dashboard.html 导出 PDF 后图表乱；并指出 aionrs agent 收到"转 PDF"指令时不知道 1ONE 已内置导出能力，自己装 Puppeteer 造轮子。本轮三步修复：1) HTML→PDF 动态等待；2) Office 文件→PDF 跨平台导出；3) 给 aionrs 加 export_to_pdf MCP 工具让 agent 优先调内置能力。

## 一、HTML→PDF 动态内容截断修复

**文件**：`src/process/bridge/exportBridge.ts`

**根因**：dashboard.html 是纯 JS 动态渲染（Chart.js 从 CDN 加载 ~1.2s，DOMContentLoaded 在 1.66s 触发后 init()→refreshData()→buildCharts() 才画 5 个 canvas）。之前等待策略是 `document.fonts.ready`（最多 1.5s）+ 2s 硬超时，但页面没 web 字体，fonts.ready 在 DOMContentLoaded 之前就 resolve，2s 硬超时触发时图表还没画完 → PDF 截到半成品。

**修复**：重写等待逻辑，4 步在页面内执行：
1. 等 `document.fonts.ready`（最多 1.5s）
2. 等 network idle（PerformanceObserver 监听 resource 请求，500ms 无新请求算空闲，最多 4s）—— 保证 CDN 脚本下完
3. **轮询 canvas 像素**：每 100ms 检查所有 `<canvas>` 是否有实际绘制内容（alpha > 10 的像素 > 50 个），最多 4s —— 保证 Chart.js 画完
4. 300ms settle delay 等 late layout/paint

硬超时放宽到 8s 兜底。用 chrome-devtools 在 dashboard.html 上实跑验证：5 个 canvas 全部画完（drawnPixels 191814/45517/62216/36582/38482），KPI `¥1589万`、表格 12 行都填充。

## 二、Office 文件→PDF 跨平台导出

**文件**：`src/process/bridge/exportBridge.ts` + `src/common/adapter/ipcBridge.ts` + `PreviewPanel.tsx` + `PreviewToolbar.tsx` + `preview.json`

**背景**：1ONE 之前只有 HTML→PDF。officecli v1.0.125 的 `view <file> pdf` 子命令存在但需 exporter 插件，插件未发布（实测报 `No exporter plugin found`）。但本机有 MS Office（Word.Application COM 验证可用），mac/Linux 用户可能装 LibreOffice。

**方案**：主进程直接调 COM（Windows）/ soffice（mac/Linux），没装时 fallback 到 officecli `view <file> html` → printToPDF。

**实现**：
- IPC：`exportApi.htmlToPdf` 旁加 `exportApi.officeToPdf`（`{ filePath, defaultName }` → `{ success, filePath?, error? }`）
- `exportBridge.ts` 抽出 `renderHtmlToPdfBuffer` 共用函数；加 `officeToPdf` provider 三路分流：
  - Windows：MS Office COM（Word/Excel `ExportAsFixedFormat`、PowerPoint `SaveAs` format 32），PowerShell 子进程跑，120s 超时
  - mac/Linux：`soffice --headless --convert-to pdf --outdir`
  - 都没装或失败：`officecli view <file> html` → printToPDF
- `detectNativeOfficeConverter` 缓存检测结果（Windows 探 Word.Application COM，mac/Linux 找 soffice 路径）
- UI：PreviewPanel 对 word/excel/ppt 类型显示"导出 PDF"按钮（复用 HTML 类型的 PDF 图标）
- i18n：`preview.office.exportPdf` 三键（zh-CN/en-US）

**验证**：Excel COM 实测 3.3s 生成 4767 字节真 PDF（`%PDF-` 头）；officecli view html fallback 输出 9749 字节 HTML 正常。

## 三、aionrs export_to_pdf MCP 工具（让 agent 优先调内置能力）

**文件**：新增 `exportToPdfServer.ts` + `exportPdfMcpServer.ts`；改 `constants.ts` / `initStorage.ts` / `src/index.ts` / `build-mcp-servers.js` / `exportBridge.ts`

**根因**：aionrs 走 binary（非 OneAgent），工具只能通过 MCP server 扩展。`OneToolExecutor` 是 OneAgent 的死代码，主力不走这条。用户说"转 PDF"时 aionrs 不知道 1ONE 内置导出能力，自己装 Puppeteer。

**方案**：新建 1ONE 内置 stdio MCP server，暴露 `export_to_pdf` 工具。aionrs binary 通过 MCP 协议调用 → MCP server 进程通过 TCP 桥转发到主进程 → 主进程调已有 exportApi 逻辑。复用 TeamMcpServer 的 TCP 桥模式（4 字节 BE 长度头 + JSON body）。

**新增文件**：
- `src/process/resources/builtinMcp/exportToPdfServer.ts`：stdio MCP server，暴露 `export_to_pdf` 工具（参数 source/source_type/output_path），通过 TCP 转发到主进程（端口从 `EXPORT_PDF_MCP_PORT` env 读）。工具描述明确写"ALWAYS prefer this tool over installing Puppeteer"
- `src/process/services/exportPdfMcpServer.ts`：主进程 TCP 服务器，监听 19820 起（冲突递增最多 10 次），收到请求调 exportBridge 的共用函数（renderHtmlToPdfBuffer / convertViaWindowsCom / convertViaSoffice / convertViaOfficecliHtml）

**改动**：
- `exportBridge.ts`：5 个共用函数（renderHtmlToPdfBuffer / convertViaWindowsCom / convertViaSoffice / convertViaOfficecliHtml / detectNativeOfficeConverter）从闭包改为 export
- `builtinMcp/constants.ts`：加 `BUILTIN_EXPORT_PDF_ID/NAME` + `isBuiltinExportPdfName/Transport` 辅助函数
- `initStorage.ts`：`ensureBuiltinMcpServers` 加 `one-export-pdf` 条目；动态 import `getExportPdfMcpPort` 注入端口（首次跑端口为 0，app ready 后 re-sync 修正）；`ensureBuiltinMcpServers` 改为 export
- `src/index.ts`：app ready 启动 TCP 服务器（fire-and-forget），端口分配后 re-sync mcp.config 让 env 拿到真实端口
- `scripts/build-mcp-servers.js`：加 `exportToPdfServer.ts` 打包入口，产出 `builtin-mcp-export-pdf.js`

**端口传递**：MCP server 的 command/args/env 在 `ensureBuiltinMcpServers` 构造时固定，但 TCP 端口运行时才分配。解法：ensureBuiltinMcpServers 首次跑时端口为 0（env 空），app ready 启动 TCP 服务器拿到真实端口后 re-sync mcp.config，env 修正，aionrs 重启时拿到正确端口。

## 四、officecli 技能同步 + 助手整理（同日早些完成）

- 删 8 个过时 officecli 技能（v1.0.23/v1.0.24）+ 3 个 `_deprecated-*` 目录，从 `~/.claude/skills/` 同步 10 个最新技能（v1.0.125）：officecli-xlsx/pptx/docx/pitch-deck/academic-paper/data-dashboard/financial-model/word-form + morph-ppt（含 reference）+ morph-ppt-3d
- 挂回 academic-paper-creator + morph-ppt-creator 两个助手到 `assistantPresets.ts`，删 topic-researcher + 2 个 _deprecated 助手目录
- `shellEnv.ts` Windows PATH 加 `%LOCALAPPDATA%\OfficeCli`，修复 Electron 快捷方式启动时 agent 找不到 officecli

## 验证状态

- `tsc --noEmit` exit 0
- `vitest run`：11 文件失败 / 3647 通过——两次跑的失败集与基线完全一致，零回归（既存失败均为 enterprise/oauth/devops/statePersistence flaky 相关）
- 运行时需 `npm run restart` 桌面端实测：
  1. dashboard.html 导出 PDF 图表完整
  2. Word/Excel/PPT 文件预览工具栏点"导出 PDF"生成矢量 PDF
  3. aionrs 会话里说"把 dashboard.html 转 PDF"，确认 agent 调 `export_to_pdf` 工具而非装 Puppeteer
  4. `.aionrs.toml` 里有 `[mcp.servers.one-export-pdf]`
- 按交付约定，影响运行行为，需出新的 Windows 安装包（`npm run dist:win`）才生效

## 涉及文件汇总（本轮）

| 文件 | 改动 |
|------|------|
| `src/process/bridge/exportBridge.ts` | HTML→PDF 动态等待 + Office→PDF 三路分流 + 5 函数 export |
| `src/common/adapter/ipcBridge.ts` | 加 `exportApi.officeToPdf` 通道 |
| `src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewPanel.tsx` | 加 handleExportOfficePdf |
| `src/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewToolbar.tsx` | 加 word/excel/ppt 导出按钮 |
| `src/renderer/services/i18n/locales/zh-CN/preview.json` | 加 office.exportPdf 三键 |
| `src/renderer/services/i18n/locales/en-US/preview.json` | 加 office.exportPdf 三键 |
| `src/process/resources/builtinMcp/exportToPdfServer.ts` | **新文件** stdio MCP server |
| `src/process/services/exportPdfMcpServer.ts` | **新文件** 主进程 TCP 服务器 |
| `src/process/resources/builtinMcp/constants.ts` | 加 BUILTIN_EXPORT_PDF 常量 + 辅助函数 |
| `src/process/utils/initStorage.ts` | ensureBuiltinMcpServers 加 one-export-pdf 条目 |
| `src/index.ts` | app ready 启动 TCP 服务器 + re-sync |
| `scripts/build-mcp-servers.js` | 加 exportToPdfServer 打包入口 |

---

# 追加记录 — 2026-06-29 深夜（aionrs 助手技能注入 prewarm 竞争 + 助手/工具审查修复）

## 背景

用户选 aionrs + "财务建模助手"发送内容后无回应、返回对话框卡死。排查后顺手审查了全部预设助手和内置 MCP 工具，发现多个同类问题。

## 一、aionrs 预设助手技能注入 prewarm 竞争（严重）

**文件**：`src/process/task/AionrsManager.ts`

**根因**：aionrs 预热池（`AionrsPrewarmPool`）用占位会话构造 `AionrsManager`，占位会话 extra 只含 `workspace/customWorkspace/sessionMode`（`conversationBridge.ts:438`），**不含 `enabledSkills`**。`AionrsManager` 构造函数读 `data.enabledSkills` 预加载技能——预热时为 undefined，`loadSkillsInjection` 没被调用，`pendingSkillsInjection` 保持 null。用户点发送 → `finalizeFromPrewarm` 把真实 extra（含 enabledSkills）写回 DB，但 manager 的 `this.data` 是构造时的快照，不会刷新。`sendMessage` 检查 `pendingSkillsInjection` 为 null → 跳过技能注入 → 模型收不到技能内容 → 不回应 → UI 卡。

**修复**：`sendMessage` 首次发送时，若技能还没注入，**从 DB 现场读** `extra.enabledSkills`（而非信任构造时的 `this.data` 快照），再加载技能内容注入。新增 `skillsAlreadyInjected` 标志防重复注入。

## 二、openclaw-setup 助手技能名拼写错误（严重）

**文件**：`src/common/config/presets/assistantPresets.ts:257`

`defaultEnabledSkills` 写的是 `'one-webui-setup'`，实际技能目录是 `1one-webui-setup`（数字 1 开头）。`loadSkillsContent` 按目录名匹配，找不到就静默跳过——该技能永远不会注入到 openclaw-setup 助手。已改为 `'1one-webui-setup'`。

## 三、ACP agent 未注入 one-export-pdf MCP（中等）

**文件**：`src/process/agent/acp/mcpSessionConfig.ts` + `src/process/agent/acp/index.ts`

**根因**：`loadBuiltinSessionMcpServers` 只为 ACP 注入 `one-web-tools`，缺 `one-export-pdf`。所有 ACP agent（Claude/Codex/Qwen/CodeBuddy 等）无法用内置 PDF 导出工具，会自己装 Puppeteer 造轮子。

**修复**：
- `mcpSessionConfig.ts` 新增 `buildOneExportPdfAcpSessionMcpServer(scriptPath, port)`，port 为 0 时返回 null（TCP 服务器没就绪就跳过，re-sync 后补）。
- `acp/index.ts:1690` web-tools 注入点旁加 export-pdf 注入，端口动态读 `getExportPdfMcpPort()`，try/catch 兜底。
- 不破坏现有 aionrs PDF 链路（aionrs 走 config.toml，ACP 走 session 级，两条独立路径）。

## 四、审查确认的非 BUG 项（勿当 BUG 重复修）

以下三项在 2026-06-29 深夜审查中确认**不是 BUG**，是架构限制或产品决策，后续会话不要当成待修问题处理。如需改动需产品决策，不能擅自当 bug 修：

- **OpenClaw / NanoBot 无内置 MCP 注入**：这两个 agent 通过 CLI（`nanobot agent` / openclaw gateway）spawn 子进程，不走 MCP 协议，没有 tools 注入机制。注入了也无效——这是架构限制，不是 bug。要改得先让这两个 CLI 支持 MCP，属功能开发。
- **aionrs config.toml MCP 注入是启动时一次性**：用户会话中动态 enable/disable MCP 不会实时同步到 aionrs（ACP 是 session 级天然动态）。已有 app ready + 端口就绪后 re-sync 机制（`index.ts:628`）。剩余的"会话中动态变更"不同步是已知限制，改动面大且与 PDF 无关，非 bug。
- **enabledByDefault 白名单只含 9 个预设**（`initStorage.ts:598-607`）：19 个预设只有 9 个默认启用，其余 10 个（officecli 系列 pitch-deck/dashboard/financial-model/academic-paper/morph-ppt + game-3d/ui-ux-pro-max/planning-with-files/human-3-coach/social-job-publisher）新用户默认看不到。这是产品决策（哪些助手默认可见），不是配置 bug。要加哪些进去需产品拍板。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/process/task/AionrsManager.ts` | sendMessage 从 DB 现场读 enabledSkills + skillsAlreadyInjected 防重复 |
| `src/common/config/presets/assistantPresets.ts` | openclaw-setup 技能名 one-webui-setup → 1one-webui-setup |
| `src/process/agent/acp/mcpSessionConfig.ts` | 新增 buildOneExportPdfAcpSessionMcpServer |
| `src/process/agent/acp/index.ts` | ACP session 注入 one-export-pdf MCP |

## 验证状态

- `tsc --noEmit` exit 0
- 运行时需 `npm run restart` 桌面端实测：aionrs + 财务建模助手不再卡死、技能注入生效；ACP agent 能调 `export_to_pdf`；openclaw-setup 助手技能注入生效
- 按交付约定，影响运行行为，需出新的 Windows 安装包才生效

---

# 追加记录 — 2026-06-29 深夜补（aionrs config.toml 注入失败根因：裸命令找不到 binary）

## 背景

用户在 aionrs 会话里让它"讲故事并保存为 PDF"，agent 返回 `ToolSearch No deferred tools matching "pdf" found` + `Skill 'pdf' not found`，没有 `export_to_pdf` 工具。查 aionrs 全局 `config.toml`（`%APPDATA%\aionrs\config.toml`）只有 `chrome-devtools` 和 `one-image-generation`，**缺 `one-web-tools` 和 `one-export-pdf`**。

## 根因

app 日志（`%APPDATA%\1OneClaudeCode-Dev\logs\2026-06-29.log`）反复出现：
```
[aionrs] Failed to inject built-in MCP servers: Command failed: aionrs --config-path
```

`OneCmdAionrsMcpAgent.getAionrsConfigPath`（`OneCmdAionrsMcpAgent.ts:45`）用裸命令 `execSync('aionrs --config-path')`，但 aionrs binary 是 1ONE 内置打包的（`resources/bundled-aionrs/<plat>-<arch>/aionrs.exe`），**不在系统 PATH 上**。裸命令找不到 → execSync 抛错 → `ensureAionrsBuiltinMcp` 的 try/catch 静默吞掉 → config.toml 永远不会被写入 `one-web-tools` / `one-export-pdf`。

讽刺的是 `resolveAionrsBinary()`（`binaryResolver.ts`）早就实现了正确的 binary 解析（bundled → dev → PATH），但 `AionrsMcpAgent` 没用它，各走各的。

## 修复

**文件**：`src/process/services/mcpServices/agents/OneCmdAionrsMcpAgent.ts`

`getAionrsConfigPath` 的 binary 解析顺序改成：显式 cliPath 参数 → `resolveAionrsBinary()` → 裸 `aionrs`（最后兜底）。命令加引号 `"${cmd}" --config-path` 防路径含空格。复用现成的 `resolveAionrsBinary()`，不重复造轮子。

## 验证

- `tsc --noEmit` exit 0
- 手动验证：`"./resources/bundled-aionrs/win32-x64/aionrs.exe" --config-path` 正确返回 `%APPDATA%\aionrs\config.toml`
- 运行时需 `npm run restart`：重启后 `ensureAionrsBuiltinMcp` 会用完整 binary 路径调 `--config-path`，成功写入 `one-web-tools` + `one-export-pdf`（带端口）到 config.toml。aionrs 会话里说"保存为 PDF"应能调到 `export_to_pdf` 工具。
- 按交付约定，影响运行行为，需出新的 Windows 安装包才在正式版生效

---

# 追加记录 — 2026-06-29 晚（preset 助手路由：按模型协议走 aionrs，修卡死）

## 背景

用户选"财务建模助手"等预设助手发送消息后，app 完全卡死、进程死掉。诊断证据（`%APPDATA%\1OneClaudeCode-Dev\logs\2026-06-29.log` 16:36:14）：

```
[renderer:handleSend start] { isPreset: true, effectiveAgentType: 'gemini', selectedAgent: 'custom' }
[renderer:presetRules resolved] { hasRules: true }
[renderer:enabledSkills resolved] { enabledSkills: ['officecli-financial-model'] }
← 之后主进程心跳停，整个 app 卡死
```

## 根因

所有 21 个预设助手 `presetAgentType: 'gemini'`（`assistantPresets.ts`），`getEffectiveAgentType`（`useAgentAvailability.ts`）直接返回它，**不看当前模型**。用户用 OpenAI 协议模型（deepseek/kimi/qwen/doubao）开 preset 助手时，被硬编码路由到 gemini 分支（`useGuidSend.ts:153`），用 `gemini-with-google-auth` placeholderModel 创建 gemini 会话。用户没配 Google OAuth → gemini agent 启动卡死 → `conversation.create.invoke` Promise 永远 pending → `sendingRef`/`loading` 不复位 → 主进程也被拖死（心跳停）。

附加问题：`getAvailableFallbackAgent` fallback 顺序第一个是 gemini，aionrs 不可用时会 fallback 到 gemini 再次卡。

## 正解：改路由，不删引擎、不改 preset 配置

aionrs 已具备承载 preset 助手的全部能力（6-29 刚做完）：
- presetRules 注入：`AionrsAgent.start()` 用 `init_history` 命令发 `[Assistant System Rules]\n${presetRules}`（`src/process/agent/aionrs/index.ts:334`）
- enabledSkills 注入：`AionrsManager.sendMessage` 从 DB 现场读 enabledSkills（commit fb6f7b6）
- worker 透传：`new AionrsAgent({ ...data })`（`src/process/worker/aionrs.ts:30`）

Gemini 引擎保留，仅在当前模型是 Google Gemini/Vertex 时承载 preset。

## 为什么不直接改 presetAgentType 为 'aionrs'

`PresetAgentType` 类型（`src/common/types/acpTypes.ts:21`）是 `'gemini' | 'claude' | 'codex' | 'codebuddy' | 'opencode' | 'qwen' | 'kiro'`——**没有 'aionrs'**。直接改会类型报错 + 要改 `resolvePresetAgentType`/`buildAgentConversationParams` 等多处 + 改 21 个配置项。更小的改动：保留 `presetAgentType: 'gemini'` 作原始值，在 `getEffectiveAgentType` 一处按模型协议覆盖。

## 修复

### 1. `getEffectiveAgentType` 按模型协议路由（核心）

**文件**：`src/renderer/pages/guid/hooks/useAgentAvailability.ts`

- 加 `currentModel?: TProviderWithModel` 入参
- `originalType === 'gemini'` 时按 `currentModel.platform` 覆盖：`'gemini' | 'gemini-vertex-ai'` → 保持 gemini；其他（custom/new-api/anthropic/bedrock 等 OpenAI 协议）→ 覆盖成 `'aionrs'`
- `isMainAgentAvailable('aionrs')` 直接返回 true（aionrs 是内置打包引擎，始终可用）
- `getAvailableFallbackAgent` fallback 顺序改成 aionrs 优先、gemini 最后：`['aionrs', 'gemini', 'claude', 'qwen', 'codex', 'codebuddy', 'opencode']`

### 2. currentModel 透传链

**文件**：`src/renderer/pages/guid/hooks/useGuidAgentSelection.ts` + `src/renderer/pages/guid/GuidPage.tsx`

`useGuidAgentSelection` 加 `currentModel` 参数，透传给 `useAgentAvailability`。GuidPage 把 `modelSelection.currentModel` 传进去。

### 3. useGuidSend aionrs 分支接收 preset

**文件**：`src/renderer/pages/guid/hooks/useGuidSend.ts`

aionrs 分支入口判断从 `selectedAgent === 'aionrs'` 改成 `selectedAgent === 'aionrs' || (isPreset && finalEffectiveAgentType === 'aionrs')`，仿 gemini 分支 preset 模式（line 153）。preset 助手 `selectedAgent` 是 'custom'，靠 `finalEffectiveAgentType === 'aionrs'` 进分支。

aionrs 分支 realExtra 已含 `presetRules`（line 334）和 `enabledSkills`（line 335），内部无需改。

### 4. gemini 分支自然不再拦截

`useGuidSend.ts:153` gemini 分支条件 `(isPreset && finalEffectiveAgentType === 'gemini')`——改完后只有 Google 模型才会 `finalEffectiveAgentType === 'gemini'`，OpenAI 协议会是 'aionrs' 进 aionrs 分支。条件不用改。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/guid/hooks/useAgentAvailability.ts` | getEffectiveAgentType 按模型协议路由 + isMainAgentAvailable(aionrs)=true + fallback 顺序调整 |
| `src/renderer/pages/guid/hooks/useGuidAgentSelection.ts` | 加 currentModel 参数透传 |
| `src/renderer/pages/guid/GuidPage.tsx` | 传 currentModel 给 useGuidAgentSelection |
| `src/renderer/pages/guid/hooks/useGuidSend.ts` | aionrs 分支入口接收 preset |

## 不改

- **不删 Gemini 引擎**——`GeminiAgentManager` / `src/process/agent/gemini/` 全保留，仅 Google 模型时承载 preset
- **不改 `assistantPresets.ts`**——21 个 preset 的 `presetAgentType: 'gemini'` 保留作原始配置
- **不改 `PresetAgentType` 类型**——不加 'aionrs'，避免连锁改 buildAgentConversationParams
- **诊断日志暂留**——`[guid:send]`/`[renderer:*]`/`[heartbeat]` 验证路由修复后跑通再单独 commit 清理

## 验证状态

- `tsc --noEmit` exit 0
- 运行时需 `npm run restart`：选 deepseek（OpenAI 协议）+ 财务建模助手，确认 `[renderer:handleSend start]` 的 `effectiveAgentType` 变 'aionrs'、进 aionrs 分支、不卡死、技能+规则注入生效
- 回归：Google Gemini 模型 + preset 助手仍走 gemini 分支；非 preset 的 aionrs agent 不受影响
- 按交付约定，影响运行行为，需出新的 Windows 安装包才在正式版生效

---

# 追加记录 — 2026-06-29 深夜（preset 路由收尾：模型选择器联动 + 卡死真因=诊断 console.log + 移除全部临时诊断）

承接 `0ab4741`（GLM 把 preset 助手按协议路由到 aionrs）。实测发现两个遗留问题，定位修复后移除全部临时诊断。

## 一、模型选择器没联动（"模型选不了"）

**文件**：`GuidPage.tsx`、`useAgentAvailability.ts`

**根因**：`0ab4741` 让 preset 的 `effectiveAgentType` 从 gemini 改成 aionrs，但 `GuidPage.isGeminiMode`（决定模型选择器走 provider 模式还是 ACP 模式）的条件 B 仍写死 `agentType === 'gemini'`，没把"路由到 aionrs 的 preset"算进去 → 落到 `GuidModelSelector` 的 fallback 分支（显示"默认模型/首次连接后显示列表"），用户选不了 deepseek。

**修复**：
- `isGeminiMode` 条件 B 加 `|| agentType === 'aionrs'`（425 行注释本就写明 gemini/aionrs 都用 provider 选择器，是明显遗漏）
- `getEffectiveAgentType` 的 Google 模型判断补 `'gemini-with-google-auth'`（否则 Google 账号登录的 Gemini 用户被误路由到不支持 OAuth 的 aionrs）

## 二、卡死真因 = 诊断 console.log 自己引入（重要教训）

**现象**：模型选择器修好后，发消息仍卡死（主进程心跳停、create handler 没进）。

**定位**：双层同步落盘探针（绕过 logger 异步缓冲）——
- IPC 入口探针（`main.ts`）：`parsed name=subscribe-create-conversation` 后无 `emitted` → 卡在 `emitter.emit` 同步执行 handler
- create handler 探针：`ENTER (before console.log)` 有、`after console.log` 无 → **卡死就在那行 `console.log`**

**根因**：`f8af392` 临时加的诊断 `console.log('[conversationBridge] create invoked', ...)` 被 `@office-ai/platform` patch 成会触发 `emit('officeai-logger')` 广播；在 `emit('subscribe-create-conversation')` 的同步调用栈深处再触发广播（`win.webContents.send` + websocket），把主进程 event loop 冻死。删掉即解（payload 仅 1KB，已排除大小因素）。

**教训**：排查卡死时加的诊断 console.log 反而成了卡死源——观察行为改变了被观察对象。诊断要用同步 `appendFileSync` 落盘，**绝不在 emit 深栈用被 patch 的 console.log**。

## 三、移除全部临时诊断

清掉 `f8af392` + `922b4c1` + 本轮排查加的所有诊断：`main.ts` IPC 入口探针（恢复原 handle）、`index.ts` 5s 主进程心跳、`ipcBridge.ts` `diag.log` 通道、`conversationBridge.ts` createTrace/diagLog provider/create+sendMessage 的 console.log/prewarm claim+finalize 日志、`useGuidSend.ts` guid:send diag 函数+全部调用+渲染层转发。保留 `[aionrs:prewarm]` 性能日志（预热命中率，非本次诊断）。

## 四、问题二："做不出内容" = 模型能力，非 1ONE bug

**现象**：用 `deepseek-v4-flash-openai` 开财务建模助手，ExecCommand 反复超时、空表。

**定位**：技能注入链路**完全正常**——`officecli-financial-model/SKILL.md`（29KB，officecli 35 次）正确注入到 session（session 文件含 officecli 31 次 + `Pre-loaded` 标记）。但 aionrs 输出里 officecli **0 次**，模型 thinking 是"试试 npm 装包"、跑 python 检测 → **deepseek-v4-flash 收到技能却不遵循，自己瞎试 python/npm**。

**结论**：flash 是快速版、推理弱、不遵循复杂技能。**换更强模型（deepseek 正常版 / kimi-k2 / qwen 等）即解**——实测换强模型后完整做出 SaaS 3 年财务模型（多 sheet + 图表 + 公式校验 + 自修 4 处公式）。非注入链路 bug，无需改代码。

## 涉及文件（本轮真正改动）

| 文件 | 改动 |
|------|------|
| `GuidPage.tsx` | isGeminiMode 条件加 aionrs |
| `useAgentAvailability.ts` | getEffectiveAgentType 补 gemini-with-google-auth |
| `useGuidSend.ts` | 移除 diag 诊断 |
| `conversationBridge.ts` | 移除 createTrace/diagLog/console.log 诊断 |
| `main.ts` | 移除 IPC 入口探针（净改动 0） |
| `index.ts` | 移除主进程心跳 |
| `ipcBridge.ts` | 移除 diag.log 通道 |

## 验证状态

- `tsc --noEmit` exit 0；诊断代码 grep 全清
- 运行时实测：财务建模助手 + 强模型不卡、能选模型、做出完整财务模型
- 按交付约定，影响运行行为，需出新 Windows 安装包

---

# 追加记录 — 2026-06-30（全面清除 IPC handler 内 console/mainLog — 修复发送框卡死 + 全局设置冻结）

承接 commit `4b9453c`。两个持续 bug 的根因同属同一模式：IPC handler 调用栈内的 `console.*` 触发主进程死锁。

## 背景：为什么 console.log 会冻死主进程

`@office-ai/platform` 的 bridge adapter 在 `ipcMain.handle(ADAPTER_BRIDGE_EVENT_KEY)` 内同步执行 `emitter.emit(name, data)`（EventEmitter3，完全同步）。这个 `emit` 会递归调用所有已注册的 provider handler。

`console.log/warn/error` 被 `@office-ai/platform` patch 后会触发 `emit('officeai-logger')` 广播——而 `bridge.adapter.emit()` 内部执行 `win.webContents.send(...)` + `broadcastToAll(...)` (WebSocket)。这两者都是向外部进程发消息，在同步调用栈内调用会阻塞 Electron 主进程 event loop 直到发送完成，形成死锁：

```
ipcMain.handle → emitter.emit(handler) → console.log
  → emit('officeai-logger') → win.webContents.send  ← 主进程在此冻死
```

`mainLog/mainWarn/mainError`（`mainLogger.ts`）并不安全——内部先调 `console.*`（触发 patch），再调 `ipcBridge.application.logStream.emit()`（再触发一次 bridge.emit），等同于双重触发。

## Bug 1：全局设置（/settings）点击后 UI 冻结

**路径**：`/settings` → `/settings/agent` → `AgentSettings` → `LocalAgents` mount → `getAvailableAgents.invoke()` → main process IPC handler

**根因**：
- `acpConversationBridge.ts` 的 `getAvailableAgents` catch 块有 `mainWarn`
- `modelBridge.ts` 的 `fetchModelList` 同步分支（Vertex AI / MiniMax）有 `console.log`；Anthropic/Gemini catch 块有 `console.warn`
- 任何一次 `getAvailableAgents` 或 `fetchModelList` IPC 调用触发上述路径即冻死

## Bug 2：aionrs 发送框永久 loading: true

**路径**：prewarm 结束 → navigate → `AionrsSendBox` mount → `processInitialMessage` → `executeCommand` → `runtimeView.markSendStarted()`（`canSendMessage=false`）→ `sendMessage.invoke()` → main process handler → `conversationSendService.sendConversationMessage`

**根因**：`conversationSendService.ts` 的 `resolveWorkspaceFiles` catch 和 `getOrBuildTask` catch 有 `console.error`；handler 冻死 → IPC 永不返回 → `markSendAccepted()` 永不调用 → sendbox 永久锁定

## 修复（commit 4b9453c）

移除 4 个文件共约 20 处 console/mainLog 调用：

| 文件 | 处数 | 说明 |
|------|------|------|
| `conversationBridge.ts` | 14 | 含 prewarm 计时 console.log（t0 变量一并删除） |
| `modelBridge.ts` | 5 | fetchModelList 同步分支 + catch |
| `acpConversationBridge.ts` | mainLog + mainWarn | 清理后删除 mainLogger/summarizeAcpModelInfo 无用导入 |
| `conversationSendService.ts` | 3 | sendMessage / cleanup 路径 |

策略：全部直接删除（catch 块不需要日志，错误已通过返回值传给 renderer；无法替换为 mainLog，因为 mainLog 同样不安全）。

## 规则（累积）

- **绝不在 emit 深栈用 console.*（包括 mainLog/mainWarn/mainError）**
- **mainLogger.ts 不是安全替代**——它既调 console.* 又再调 bridge.emit，双重触发
- **诊断用 `appendFileSync`**，不用 console
- 任何 `ipcBridge.*.provider(async handler => { ... })` 内部——handler 整个调用树中不得出现 console 调用

---

# 追加记录 — 2026-07-01（aionrs MISS 路径主进程冻结排查 + 缓存修复）

> **⚠️ 给下一个 AI 的状态交接（必读）**
>
> | 已尝试但无效 | 已应用待验证 | 仍未确定 | 下一步 |
> |---|---|---|---|
> | `4b9453c` 清除 console/mainLog（用户实测无效） | `e332557` `getEnhancedEnv()` + `resolveAionrsBinary()` 缓存（**用户尚未测试**） | 永久冻结真因（见"仍存疑"章节，A/B/C/D 四种可能） | 等用户 `npm run restart` 实测；若仍冻加 `appendFileSync` 探针定位卡死行 |
>
> **不要**再去移除 console/mainLog——已做过且无效。**不要**重新分析 IPC bridge 同步调用栈——已排除。

承接 `4b9453c`（清除 console/mainLog）。用户确认清除 console 后冻结问题**依然存在**，继续深入定位。

## 一、冻结现象

- Guid 页选 aionrs 发送消息，renderer 日志：`[aionrs:prewarm] claim MISS +6ms — fallback to create+warmup`
- 之后 Electron 主进程永久无响应（Windows "未响应"）

## 二、HIT vs MISS 路径差异（根因分析）

**HIT 路径**（不冻）：
- `prewarm.claim.invoke` → `AionrsPrewarmPool.claim()` → 直接返回缓存 manager（同步，无 await，不进入微任务）

**MISS 路径**（冻）：
- `sendMessage.invoke` → `conversationSendService.sendConversationMessage`
- → `workerTaskManager.getOrBuildTask(id)`
- → **`await this.repo.getConversation(id)`**（异步，产生微任务边界）
- → `_buildAndCache` → `factory.create(conversation, options)` → `new AionrsManager(...)`
- → `ForkTask` 构造函数同步调 `this.init()`（`src/process/worker/fork/ForkTask.ts:35`）
- → `init()` 第 63 行：`const workerEnv = getEnhancedEnv()`

**关键**：`await repo.getConversation` 之后的代码在**微任务**中运行。微任务执行期间 Windows 消息泵（macrotask）被挂起，若微任务耗时 >5s → Windows 判定"未响应"。

## 三、`getEnhancedEnv()` 无缓存问题

`src/process/utils/shellEnv.ts` 的 `getEnhancedEnv()` 原实现每次都执行完整计算：
- `loadShellEnvironment()`（读 shell env）
- `getWindowsExtraToolPaths()`：18+ 个路径全部调 `existsSync()`（npm/nvm/git/cygwin/bun/officecli 等）
- 如果环境变量中含网络映射路径（`\\server\share`），`existsSync` 会等待网络超时（可达数十秒）

这在微任务内同步执行 → 直接冻死主进程。

## 四、已应用修复（commit e332557）

**文件**：`src/process/utils/shellEnv.ts`

新增模块级缓存：
```typescript
let _baseEnhancedEnvCache: Record<string, string> | undefined;

function _buildBaseEnhancedEnv(): Record<string, string> { /* 原完整逻辑 */ }

export function getEnhancedEnv(customEnv?: Record<string, string>): Record<string, string> {
  if (!_baseEnhancedEnvCache) _baseEnhancedEnvCache = _buildBaseEnhancedEnv();
  if (!customEnv) return _baseEnhancedEnvCache;
  return {
    ..._baseEnhancedEnvCache,
    ...customEnv,
    PATH: customEnv.PATH
      ? mergePaths(_baseEnhancedEnvCache.PATH, customEnv.PATH)
      : _baseEnhancedEnvCache.PATH,
  };
}
```

首次调用（app 启动期间，非微任务）完整计算并缓存；后续调用（ForkTask 构造、MISS 路径微任务内）直接返回缓存，零 IO。

**同批**：`src/process/agent/aionrs/binaryResolver.ts` — `resolveAionrsBinary()` 加模块级 `_resolvedBinaryPath` 缓存，避免每次 IPC 调用都跑 `execSync('where aionrs')`。

## 五、已排除的假说

| 假说 | 排除理由 |
|------|---------|
| `console.log` 在 IPC 深栈触发 bridge.emit 死锁 | commit `4b9453c` 已清除，用户确认**冻结依然存在** |
| `bridge.adapter.emit` / `win.webContents.send` 阻塞 | 这些调用在 async 继续中，非同步调用栈 |
| `mainLog/mainWarn` 双重触发 | 同 console 问题，`4b9453c` 已清除 |

## 六、仍不确定的根因（诚实评估）

`getEnhancedEnv` 缓存修复消除了最大嫌疑，但 18 个本地路径 `existsSync` 通常 <50ms，不足以触发 >5s 的"未响应"。永久冻死可能还有以下原因之一：

| 可能原因 | 判断 |
|---------|------|
| A. 环境变量含**网络映射路径**，`existsSync` 无限等待 | 缓存修复后首次 app 启动时仍会执行一次（非微任务），后续 MISS 路径不再触发 |
| B. Windows Defender 扫描 Node.js 可执行文件 | 仅首次 `fork()` 触发，不完全解释永久卡死 |
| C. IPC pipe buffer 满，`fcp.postMessage` 阻塞 | worker 尚未就绪时 postMessage 可能阻塞 |
| D. 缓存修复**本身就是完整修复** | prewarm 在 app 启动后台预热（非微任务）首次填充缓存，后续 MISS 路径命中缓存，0ms |

## 七、诊断方案（如仍冻结）

在以下位置加 `fs.appendFileSync(diagFile, '...\n')` 落盘探针（**不用 console.log**），确定最后一条日志即为冻结位置：

1. `conversationSendService.ts` 入口
2. `getOrBuildTask` 返回后
3. `ForkTask.init()` 调 `getEnhancedEnv()` 前后（`fork/ForkTask.ts:63`）
4. `ForkTask.init()` 调 `platform.worker.fork()` 前后（`fork/ForkTask.ts:66`）
5. `ForkTask.postMessage()` 调 `fcp.postMessage()` 前后（`fork/ForkTask.ts:121`）

## 八、顺带发现的竞态（已记录，未修）

`WorkerTaskManager.addTask`（`src/process/task/WorkerTaskManager.ts:66-73`）在 concurrent MISS 时用 `existing.task = task` 覆盖第一个 manager，孤儿 worker 进程不被 kill。目前影响不大（MISS 本来少见），暂不修。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/process/utils/shellEnv.ts` | 新增 `_baseEnhancedEnvCache` + `_buildBaseEnhancedEnv()` |
| `src/process/agent/aionrs/binaryResolver.ts` | 新增 `_resolvedBinaryPath` 模块级缓存 |

## 验证状态

- `tsc --noEmit` exit 0（commit e332557 编译通过）
- 运行时需 `npm run restart`：选 aionrs + MISS 路径（首次发送或清空预热池），确认不再冻结
- 按交付约定，影响运行行为，需出新的 Windows 安装包才在正式版生效

---

# 追加记录 — 2026-07-01（侧栏「历史会话」显示全部开关）

## 背景

侧栏「历史会话」分组（`recents`）原只显示前 8 条会话，超出部分被截断到 `/sessions` 页面才能看到。用户昨天的会话被挤掉，希望加开关在侧栏直接展开全部。

截断位置：`src/renderer/pages/conversation/GroupedHistory/index.tsx` 的 `visibleItems = section.items.slice(0, 8)`。

## 修复

在「历史会话」标题行右侧加 Arco `Switch`，受 `showAllRecents` state 控制，用 `localStorage`（key `1one:sidebar:showAllRecents`）持久化。开关打开时不 slice、"查看所有"跳转消失；关闭时维持 8 条 + "查看所有"。collapsed 侧栏不显示开关，行为不变。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/conversation/GroupedHistory/index.tsx` | 加 `showAllRecents` state + localStorage 持久化；`HistorySectionHeader` 加 `showAll`/`onShowAllChange` props + Switch UI；`visibleItems`/`hasMore` 在开关打开时不截断 |
| `src/renderer/services/i18n/locales/zh-CN/conversation.json` | `history` 下新增 `showAll`/`showRecent8` |
| `src/renderer/services/i18n/locales/en-US/conversation.json` | 同上英文 |

## 验证状态

- `tsc --noEmit`：本次改动零错误（pptPreviewBridge 的 execSync 报错为既存问题，与本次无关）
- `oxlint` 0 errors；`oxfmt --check` 全过；`check-i18n` 通过
- 运行时需 `npm run restart` 桌面端实测：开关默认关闭显示 8 条；打开后显示全部含昨天会话；重启后开关状态保留；collapsed 侧栏不显示开关
- 按交付约定，影响运行行为，需出新的 Windows 安装包（`npm run dist:win`）才在正式版生效

---

# 追加记录 — 2026-07-01 上午（aionrs 卡死问题已确认修复）

## 结论：✅ 卡死已解决

7-01 11:18 加完整启动探针 + worker 侧探针后复测，freeze.log + worker.log 显示 aionrs 链路完全正常：
- worker fork 1.9ms
- `postMessage('start')` → callback 1.9s 内返回（aionrs.exe ready）
- `init.history` callback 正常
- `send.message` callback 正常
- 模型正常流式输出（worker.log 3108 行，含 thinking / tool_running / tool_result）

## 真因（两层叠加）

1. **`getEnhancedEnv()` 无缓存**（`e332557` 已修）— 18+ 次 `existsSync` 在 `await repo.getConversation` 之后的微任务里同步执行，阻塞主进程 event loop。
2. **Windows Defender 首扫 aionrs.exe**（85MB）— 首次 spawn 被 Defender 同步扫描阻塞数十秒，叠加微任务阻塞导致 30s ready timeout 不够，`readyPromise` 永不 resolve，主进程 `postMessagePromise('start')` 永远等不到 callback → 卡死。

11:18 那次突然好了的原因：`e332557` 缓存消除微任务阻塞 + aionrs.exe 被 Defender 扫过一次后不再阻塞。

## 临时探针（待清理）

为定位卡死，在以下文件加了 `appendFileSync` 落盘探针，写到 `%TEMP%/1one-diag/freeze.log`（主进程）和 `worker.log`（worker）。**探针不改逻辑，只观测**。排查已完成，应在下一次提交时清理：

- `src/process/utils/freezeDiag.ts`（新增 helper）
- `src/index.ts`、`src/process/utils/initStorage.ts`、`src/process/task/workerTaskManagerSingleton.ts`、`src/process/task/WorkerTaskManager.ts`、`src/process/task/AionrsManager.ts`、`src/process/bridge/conversationBridge.ts`、`src/process/bridge/services/conversationSendService.ts`、`src/process/worker/fork/ForkTask.ts`、`src/process/worker/fork/pipe.ts`、`src/process/worker/utils.ts`、`src/process/worker/aionrs.ts`、`src/process/agent/aionrs/index.ts`

清理方式：删除 `freezeDiag.ts`，从上述文件移除 `diag(...)` / `wdiag(...)` / `adiag(...)` 调用和 import。**保留 `e332557` 的缓存修复**。

## 教训

1. Windows Defender 首扫 85MB binary 可阻塞 spawn 数十秒，大 binary 首次 spawn 卡死要考虑这个因素。
2. 微任务内的同步 IO 是隐形杀手 — `await` 之后的代码在微任务里，期间 Windows 消息泵被挂起。
3. `appendFileSync` 探针是观测主进程/worker 卡死的唯一可靠手段 — console.log 会被 patch 触发 bridge.emit，在 IPC 同步深栈里就是死锁源。
4. 不要在没确认真因前连续改代码 — 本次先清 console（无效）、再加缓存（部分有效）、最后加探针才定位。如果一开始就加探针，能省两轮弯路。

---

# 追加记录 — 2026-07-01 中午（客户端↔企业端连接通讯 4 个 BUG 修复 + 浏览器 agent 加载）

承接卡死排查（已解决）。用户在客户端模式（`deploymentRole=client`，`enterpriseServerUrl=192.168.11.137:25808`）下打开浏览器验证"浏览器不同步 PC 端 agent"问题时，发现设置里点 WebUI 地址会卡死，控制台出现 `0.0.0.1` / `0.0.0.19` / `0.0.0.192` / `192.168.11.137:25` / `enterprise-info 404` 诡异请求。审 538338e + 3acd4e5 后定位 4 个 BUG。

## 用户诉求

浏览器 WebUI 展示的 agent 列表，必须永远是被打开地址那台机器（终端服务器）本地的 agent：
- 浏览器打开 `http://localhost:25809` → 显示本机 agent
- 浏览器打开 `http://192.168.11.137:25808` → 显示 192.168.11.137 的本机 agent

架构上 `/api/agents/available` 端点在服务端本机执行（`acpDetector.getDetectedAgents()` + `resolveAionrsBinary()`），天然满足此诉求。本轮只需补齐前端链路。

## BUG 1+2：客户端模式下 `fetchWebuiApi` 不走远程服务端

**文件**：`src/renderer/utils/webuiApiBase.ts`

**根因**：`getWebuiApiBaseCandidates()` 在桌面+本地 WebUI 未启动时返回 `enterpriseApiOrigins`（历史记忆的地址）。客户端模式下这个列表里残留着之前 server 模式存的 `http://127.0.0.1:25809`（过期本地地址），导致所有 `fetchWebuiApi('/api/auth/*')` 都打不到远程服务端，全部失败。CONTEXT.md 6-26 写的"故意不动 `getWebuiApiBaseUrl`"代价就是这个。

**修复**：`getWebuiApiBaseCandidates()` 客户端模式（`getClientEnterpriseServerOrigin()` 返回非 null）时，把远程 origin 放第一位，历史 remembered origins 作 fallback。这样 `fetchWebuiApi` 优先打远程，远程不可达才试 fallback。

## BUG 1 配套：切部署模式时清空 `enterpriseApiOrigins`

**文件**：`src/renderer/pages/settings/WebuiSettings/EnterpriseDeploymentModeCard.tsx`

**根因**：`writeDeploymentConfig` 之前不清 `enterpriseApiOrigins`，切模式后过期地址残留。

**修复**：`writeDeploymentConfig` 里同时 `ConfigStorage.set(ENTERPRISE_API_ORIGINS_KEY, [])`，浏览器侧 `localStorage.removeItem`。

## BUG 3：服务器地址端口校验

**文件**：`src/renderer/pages/settings/WebuiSettings/EnterpriseDeploymentModeCard.tsx`

**根因**：用户可能误填 `192.168.11.137:25`（SMTP 端口），Chrome 视为 `ERR_UNSAFE_PORT` 拒绝 fetch，心跳永远失败。`hasExplicitPort` 只检查有无端口，不检查范围/安全性。

**修复**：新增 `validateServerPort()` — 检查端口 1024-65535 范围 + 拒绝 Chrome unsafe port 列表（25/110/143/465/587/993/995 等）。`handleSave` 时校验，失败给具体原因提示。

## BUG 4：`fetchRemoteEnterpriseJson` 无超时（卡死真凶）

**文件**：`src/renderer/utils/enterpriseJoinApi.ts`

**根因**：538338e 加的 OAuth 轮询 `poll()` 每 1 秒调 `fetchRemoteEnterpriseJson`，但 `fetch(url, init)` 无超时。远端 TCP 半开（handshake 成功但响应慢）时 fetch 长挂起，10 次轮询 × 长挂起 = 渲染进程网络线程池占满 → 后续所有 fetch 立即失败，Chrome 内部把失败 URL 解析成 `0.0.0.X` 碎片。这就是用户看到 `0.0.0.1` / `0.0.0.19` / `0.0.0.192` 的真因。

**修复**：`fetchRemoteEnterpriseJson` 默认加 `AbortSignal.timeout(5000)`，5 秒超时。caller 传 `init.signal` 时尊重 caller。

## 浏览器 agent 加载链路验证（用户诉求）

**文件**：`src/renderer/pages/guid/hooks/useGuidAgentSelection.ts` + `src/process/webserver/routes/apiRoutes.ts`（都是之前未提交的改动，本轮验证 + 补强）

**架构确认**：
- 浏览器 `fetch('/api/agents/available')` 相对 URL → 打到浏览器加载页面的那台机器
- 服务端 handler 调 `acpDetector.getDetectedAgents()` + `resolveAionrsBinary()` — 在服务端本机执行，返回服务端的本地 agent
- 天然满足"浏览器打开哪台机器地址，就显示那台机器 agent"的诉求

**补强**：`AVAILABLE_AGENTS_SWR_OPTIONS` 关了 `revalidateOnFocus`（避免 IPC spam），但导致 WebUI 用户登录前看不到 agent，登录后也不自动重拉。新增监听 `one-enterprise-context-refresh` 事件（登录成功 dispatch）触发 `mutateAvailableAgents()` 重新拉取。

## 涉及文件

| 文件 | 改动 |
|---|---|
| `src/renderer/utils/enterpriseJoinApi.ts` | `fetchRemoteEnterpriseJson` 加 5s `AbortSignal.timeout` |
| `src/renderer/utils/webuiApiBase.ts` | `getWebuiApiBaseCandidates` 客户端模式优先远程 origin |
| `src/renderer/pages/settings/WebuiSettings/EnterpriseDeploymentModeCard.tsx` | `writeDeploymentConfig` 清 `enterpriseApiOrigins` + 新增 `validateServerPort` 端口校验 |
| `src/renderer/pages/guid/hooks/useGuidAgentSelection.ts` | 监听 `one-enterprise-context-refresh` 触发 SWR mutate（补强，文件本身之前未提交） |
| `src/process/webserver/routes/apiRoutes.ts` | `/api/agents/available` 端点（之前未提交，本轮验证架构正确） |

## 验证状态

- `tsc --noEmit` exit 0（零错误，pptPreviewBridge 既存错误与本次无关）
- 运行时需 `npm run restart` 桌面端实测：
  1. 客户端模式设置→WebUI 填远程服务端地址（含合法端口），保存 → 不再卡死
  2. 浏览器打开远程服务端地址登录后 → Guid 页显示服务端本地 agent
  3. 浏览器打开本机地址登录后 → Guid 页显示本机 agent
  4. 客户端模式 OAuth 轮询远端不可达时 5s 超时，不再挂死渲染进程
- 按交付约定，影响运行行为，需出新的 Windows 安装包才在正式版生效



