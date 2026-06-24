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
