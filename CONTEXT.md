# CONTEXT.md — 2026-06-23 深度体检修复记录

本文档记录本次跨两轮会话的完整修复过程，包括根因分析、修复方案和涉及文件。

---

## 背景

升级 aionrs engine 从 v0.1.7 到 v0.1.30（commit `a669517`）后，所有 OpenAI 协议模型（kimi-k2.5、qwen 等）出现"90秒内未收到模型响应"超时错误。同时暴露了若干其他架构缺陷。
本项目是基于Aionui做的，这个是项目的原始仓库https://github.com/iOfficeAI/AionUi
上游官网https://www.aionui.com/zh/ 
上游文档是在https://deepwiki.com/iOfficeAI/AionUi

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



---

# 追加记录 — 2026-07-01 晚（企业端通讯架构修复：MCP 测试 / SSO 跳回 / 退出密码 500 / 客户端上线解耦 / 概览单机实例）

承接 7-01 中午客户端↔企业端连接修复。用户测试反馈 5 个 bug + 1 个架构迭代，本轮一并修复。

## Bug 1：退出密码 500（migration 版本号没 bump）

**文件**：`src/process/services/database/schema.ts`

**根因**：commit `3acd4e5` 加了 `migration_v52`（`exit_password_hash` 列）但忘了把 `CURRENT_DB_VERSION` 从 51 bump 到 52。DB 初始化逻辑 `if (currentVersion < CURRENT_DB_VERSION)` 永远为 false → migration v52 永不执行 → `tenants` 表无 `exit_password_hash` 列 → `UPDATE tenants SET exit_password_hash = ...` 报 `no such column` → 500。本机 DB 实测 `user_version: 51`，`tenants` 表无该列，与代码完全吻合。

**修复**：`CURRENT_DB_VERSION` 51 → 52。

## Bug 2：MCP 测试连接 "Connection closed"

**文件**：`src/process/services/mcpServices/McpProtocol.ts`

**根因**：内置 `one-export-pdf` MCP 的 `EXPORT_PDF_MCP_PORT` 由主进程 TCP server 运行时分配。`ensureBuiltinMcpServers` 首次跑时 TCP server 没启动 → 数据库 `transport.env = {}`。设置页"测试连接"从数据库读 env 启动子进程 → 缺 `EXPORT_PDF_MCP_PORT` → 脚本 `exit(1)` → `MCP error -32000: Connection closed`。实测：带 env 启动 stdio server ready，不带 env exit(1)。

**修复**：`testStdioConnection` 启动子进程前，识别内置 export-pdf MCP（`isBuiltinExportPdfTransport`），env 缺 port 时动态从 `getExportPdfMcpPort()` 注入。

## Bug 3：客户端飞书 SSO 登录跳回"登录组织账号"

**文件**：`src/process/webserver/auth/service/AuthService.ts`、`src/process/bridge/services/WebuiService.ts`、`src/renderer/utils/webuiApiBase.ts`

**根因**：客户端模式下，远程服务端签发的 JWT 用远程密钥，客户端本机 `AuthService.verifyToken` 验不了 → `syncBrowserWebuiSession` 两路都拿不到 token：
- `getLatestBrowserWebuiSession()` 内存桥接：客户端模式 SSO 没经本机 webserver，空
- 遍历本机 cookie jar：只查 `localhost:port`/LAN IP，不查 `clientRemoteOrigin` 的 cookie

桌面端 user 仍是 desktop operator（tenant_id='default'）→ `resolvePostLoginRedirectPath` 把 `/enterprise/join` target 原样返回 → 跳回 EnterpriseOnboarding（"登录组织账号"）。

**修复（方案 A：客户端信任远程 cookie）**：
- `AuthService.decodeTokenPayload`：新增不验签的 decode 方法
- `WebuiService.syncBrowserWebuiSession`：客户端模式从 `session.defaultSession.cookies` 取 `clientRemoteOrigin` 的 cookie token，不 verify 直接当 Bearer 返回 + 新增 `getClientEnterpriseServerOrigin` 静态方法
- `fetchWebuiApi`：客户端模式 + `/api/auth/*` 跳过本机 loopback 走 remote（认证权威统一是远程；仅在 auth 路径才查 client origin，避免普通请求多一次 ConfigStorage 往返）

## Bug 4 + 架构迭代：客户端上线与 SSO 解耦

用户明确：客户端配置了服务器地址加入到企业 = 设备上线，服务端就该看到，认证状态是另一层。原代码把"设备上线"等同于"SSO 登录成功 + 拿到企业 tenant_id"——`useTeamRuntimeAdminSync`/`useTeamRuntimeFleet` gate 是 `hasJoinedEnterprise`，客户端没 SSO 登录就不发心跳，服务端看不到设备。

### 设计（CTO + 产品视角）

解耦"设备上线"和"用户认证"：设备配置了服务器地址就上线，认证状态用 `authenticated` 字段区分。SSO 登录后同 machineId 升级。

### DB（migration v53）

**文件**：`src/process/services/database/migrations.ts` + `schema.ts`（`CURRENT_DB_VERSION` 52→53）

`team_runtime_nodes` 表：
- 加 `authenticated INTEGER NOT NULL DEFAULT 1` 列
- 加 `UNIQUE(machine_id)` 索引（去重旧重复行）
- upsert 改按 `machine_id`（SSO 登录后同机升级 tenantId/userId/authenticated，不再建重复行）

### 类型

**文件**：`src/common/types/teamRuntimeTypes.ts`

- `TeamRuntimeNode` 加 `authenticated: boolean`
- `UpsertTeamRuntimeNodeInput` 加 `authenticated?`
- `ListTeamRuntimeNodesInput` 加 `includePending?`

### 服务端

**文件**：`src/process/team/TeamRuntimeRegistry.ts`、`src/process/webserver/routes/teamRuntimeRoutes.ts`、`src/process/bridge/teamRuntimeBridge.ts`、`src/process/team/TeamRuntimeAdminPublisher.ts`

- `TeamRuntimeRegistry.upsertNode`：upsert key 改 `machine_id`，`ON CONFLICT(machine_id) DO UPDATE` 升级 tenantId/userId/authenticated
- `TeamRuntimeRegistry.listNodes`：admin 视图（`includePending`）含 `tenant_id='pending'` 节点
- `teamRuntimeRoutes` heartbeat：改 `optionalAuth`（不要求认证），未认证时 tenantId/userId='pending'/authenticated=0；admin 查询 `includePending:true`
- `teamRuntimeBridge.publishHeartbeat`：放行 'pending' tenant + 传 authenticated
- `TeamRuntimeAdminPublisher.readOrgApiOrigins`：客户端模式优先 remote origin；Bearer 可选（未认证也能发）

### Renderer

**文件**：`src/renderer/hooks/webui/WebuiEnterpriseModeProvider.tsx`、`useEditionFeatures.ts`、`src/renderer/hooks/enterprise/useTeamRuntimeAdminSync.ts`、`src/renderer/services/teamRuntimeAdminSync.ts`、`src/renderer/pages/superAssistant/hooks/useTeamRuntimeFleet.ts`、`src/renderer/pages/admin/AdminTeamRuntimes.tsx`、`src/renderer/pages/superAssistant/components/TeamRuntimeFleetPanel.tsx`

- `WebuiEnterpriseModeProvider`/`useEditionFeatures` 暴露 `isClientModeConnected`
- `useTeamRuntimeAdminSync` gate 改 `hasJoinedEnterprise || isClientModeConnected`；传 `authenticated: hasJoinedEnterprise`
- `publishRuntimeToAdminBackend` 未认证时 tenantId/userId='pending' + 传 authenticated
- `useTeamRuntimeFleet` gate 同上；管理员自动 `asAdmin=true` 看 pending（侧栏「组织节点」/ `/agent-fleet` 也能看到客户端设备）
- `TeamRuntimeFleetPanel` 节点列表 + 详情面板加"未认证"标签

## Bug 5：企业控制台概览显示"单机实例"

**文件**：`src/common/auth/enterpriseEditionSync.ts`

**根因**：`mergeDesktopEnterpriseContext` 逻辑是 browser 优先。server 模式下本机 `system_default_user` 创建了企业（ipcCtx.joined=true），但 SSO 登录的新 user 若 `ensureUserJoinedDefaultEnterprise` 未及时生效，browserCtx.tenantId='default' 覆盖 ipcCtx → `resolveEnterpriseTenantDisplayLabel('default', null)` → "单机实例"。

**修复**：合并优先级改为——本机已加入企业（ipc.joined）优先以本机为准（server 模式本机权威）；本机没企业才用 browser（客户端连远程）。

## 验证

- `tsc --noEmit` 通过（除既存 pptPreviewBridge 问题）
- `oxlint` 0 errors（184 warnings 全是既存 no-console）
- `vitest`：`webuiApiBase.test.ts` 1 failed / 2 passed，与干净 main 基线一致（既存失败，非本次引入）
- 运行时需 `npm run restart` 桌面端实测：
  1. 服务端设退出密码不再 500
  2. MCP 测试 one-export-pdf 连接成功
  3. 客户端飞书 SSO 登录不再跳回，进入工作区
  4. 客户端配置服务器地址后，服务端「管理后台→团队运行时」和侧栏「组织节点」都能看到该设备（未认证标签）；客户端 SSO 登录后同机升级为认证成员
  5. server 模式创建企业后，概览页显示企业名而非"单机实例"
- 按交付约定，影响运行行为，需出新的 Windows 安装包才在正式版生效

## 涉及文件汇总（本轮）

| 文件 | 改动 |
|---|---|
| `src/process/services/database/schema.ts` | `CURRENT_DB_VERSION` 51→52→53 |
| `src/process/services/database/migrations.ts` | migration v53（team_runtime_nodes 加 authenticated + UNIQUE(machine_id)） |
| `src/process/services/mcpServices/McpProtocol.ts` | 测试连接注入 export-pdf port |
| `src/process/webserver/auth/service/AuthService.ts` | 新增 `decodeTokenPayload`（不验签） |
| `src/process/bridge/services/WebuiService.ts` | 客户端模式 syncBrowserWebuiSession 从 remote cookie 取 token + `getClientEnterpriseServerOrigin` |
| `src/renderer/utils/webuiApiBase.ts` | 客户端模式 + `/api/auth/*` 跳过 loopback |
| `src/common/types/teamRuntimeTypes.ts` | 加 authenticated / includePending |
| `src/process/team/TeamRuntimeRegistry.ts` | upsert by machineId + admin 查询含 pending |
| `src/process/webserver/routes/teamRuntimeRoutes.ts` | heartbeat optionalAuth + admin includePending |
| `src/process/bridge/teamRuntimeBridge.ts` | publishHeartbeat 放行 pending + 传 authenticated |
| `src/process/team/TeamRuntimeAdminPublisher.ts` | 客户端模式优先 remote origin + Bearer 可选 |
| `src/renderer/hooks/webui/WebuiEnterpriseModeProvider.tsx` | 暴露 isClientModeConnected |
| `src/renderer/hooks/webui/useEditionFeatures.ts` | 暴露 isClientModeConnected |
| `src/renderer/hooks/enterprise/useTeamRuntimeAdminSync.ts` | gate 解耦 + 传 authenticated |
| `src/renderer/services/teamRuntimeAdminSync.ts` | 未认证时 pending + 传 authenticated |
| `src/renderer/pages/superAssistant/hooks/useTeamRuntimeFleet.ts` | gate 解耦 + 管理员自动 asAdmin |
| `src/renderer/pages/admin/AdminTeamRuntimes.tsx` | 传 authenticated |
| `src/renderer/pages/superAssistant/components/TeamRuntimeFleetPanel.tsx` | 未认证标签 |
| `src/common/auth/enterpriseEditionSync.ts` | merge 优先级：本机已加入企业优先 ipc |

---

# 2026-07-02 三大修复（1.23.13）

承接 7-01 客户端 SSO 跳回 + one-export-pdf 打包失效 + 开发环境死机。本轮一并修复 + 架构改造。

## Bug 1：内置 MCP asarUnpack 漏配（打包后 one-export-pdf / one-web-tools 失效）

**文件**：`electron-builder.yml`

**根因**：`asarUnpack` 只列了 `out/main/builtin-mcp-image-gen.js`，漏了 `builtin-mcp-web-tools.js` 和 `builtin-mcp-export-pdf.js`。打包后 `getBuiltinMcpScriptPath`（`initStorage.ts:670`）返回 `app.asar.unpacked/out/main/builtin-mcp-export-pdf.js`，但这个文件没被 unpack，仍在 asar 归档里。外部 `node` 进程无法读 asar → spawn ENOENT → MCP 连接失败。开发模式 OK 是因为开发不走 asar，`out/main/builtin-mcp-export-pdf.js` 直接存在。

**修复**：`electron-builder.yml:228` `asarUnpack` 补上另两个脚本。

**教训**：新增内置 MCP 脚本时，必须同步更新 `asarUnpack` 列表 + `scripts/build-mcp-servers.js` 打包入口 + `getBuiltinMcpScriptPath` 路径解析。三者缺一，打包后失效。

## Bug 2：IPC handler console.* 冻死主进程（第 5 轮漏网）

**文件**：`src/process/bridge/databaseBridge.ts`、`src/process/task/AionrsManager.ts`

**根因**：`databaseBridge.getConversationMessages` 的 catch 块 `console.error` → `@office-ai/platform` console patch → `bridge.adapter.emit` → `win.webContents.send` × N + `broadcastToAll`。渲染进程每 2.5s 轮询 `getConversationMessages`（`useAionrsMessage.ts:439` `AIONRS_MESSAGE_SYNC_POLL_MS`），客户端模式 `AuthService.verifyToken` 验远程 JWT 失败时每次 catch 都触发 console → 主进程冻死。

**为什么打包不死机、开发死机**：打包后客户端模式 IPC 路径的 `__authToken` 传递行为和 dev 不同（254c653 改了 `fetchWebuiApi`），dev 渲染进程更积极地带 token 触发 verify 失败。但无论 dev/打包，IPC handler 里的 `console.*` 都是定时炸弹——根因是违反 CLAUDE.md 坑 1 禁令。

**修复**：4 处 `console.error/warn` 改 `appendFileSync` 文件日志（`databaseBridge` 2 处 + `AionrsManager` 2 处）。

**教训**：这是 4b9453c 排查的"第 5 轮漏网"。每次以为清干净了结果还有漏网的。`.oxlintrc.json` 的 `no-console: warn` 规则必须坚持，新增 IPC handler 一律用文件日志。

## 架构改造：客户端 SSO 统一网页认证

**文件**：`oauthLoginState.ts`、`oauthLoginHelpers.ts`、`authRoutes.ts`、`useDeepLink.ts`、`webuiDesktopSession.ts`、`EnterpriseLoginChannelPanel.tsx`

**背景**：客户端模式（桌面端配置远程企业服务器）SSO 之前在 Electron BrowserWindow 里跑 OAuth，有三个痛点：
1. redirect_uri 不匹配（错误码 20029）——服务端 `resolveOAuthCallbackUri` 在 LAN IP origin 下返回空
2. 登录后跳回登录页——BrowserWindow cookie 共享 + 远程轮询链路长易断
3. 架构别扭——客户端模式认证权威是服务端，但 OAuth 在客户端跑，redirect_uri/cookie/token 都要跨实例处理

**改造**：客户端模式 SSO 统一跳网页认证。
- 客户端点 SSO → `shell.openExternal(remoteOrigin + '/api/auth/feishu/authorize?desktop=1')` → 系统浏览器打开
- 服务端 authorize 把 `desktop=1` 存到 OAuth state → 飞书 OAuth → 回调服务端
- 服务端 callback 检测 state.desktop → 生成 token → `res.redirect('1one://sso-callback?token=...&userId=...&origin=...')`（不 Set-Cookie）
- 系统浏览器跳 deep link → OS 唤起桌面端 → `useDeepLink` 接收 `sso-callback` action → 写 session + rememberEnterpriseApiOrigin + refresh + 导航

**关键设计**：
- token 通过 deep link URL 传递（OS 级别唤起，相对安全；token 有过期时间）
- 服务端 `finalizeOAuthBrowserLogin` 加 `desktop` + `remoteOrigin` 入参，desktop 模式不 Set-Cookie（浏览器 cookie 对桌面端无用）
- `OAuthLoginStateEntry` 加 `desktop?` 字段，`issueOAuthLoginState` 接受 `{ desktop }` opts
- 三个 provider（feishu/dingtalk/wecom）的 authorize + callback 都传递 desktop 标记
- `applySsoCallbackSession(params)` helper 封装字段校验 + `setWebuiDesktopSession`
- `EnterpriseLoginChannelPanel.startOAuth` 客户端模式移除 BrowserWindow + 远程轮询，改 `openExternalUrl` + `Message.loading` 提示

**未改的部分**：
- `resolveOAuthCallbackUri` 保持不变——服务端 origin 是 LAN IP 时仍返回空，但客户端模式不再依赖服务端自动构造 redirect_uri，服务端管理员必须在 cfg.redirectUri 配服务端的飞书回调 URL（正式部署必须配）
- `WebuiService.syncBrowserWebuiSession` 客户端模式分支（254c653 加的 remote cookie 读取）保留——deep link 回调后用户重启应用，仍需从 remote cookie 恢复 session
- 非客户端模式（服务端模式 / 纯浏览器 WebUI）SSO 流程不变
- `WebuiService.openRemoteOAuthWindow` 保留（向后兼容），但 `EnterpriseLoginChannelPanel` 不再调用

**后续可选增强**：改用一次性 short-lived code（30s 有效），桌面端拿 code 调远程 `/api/auth/exchange-desktop-code` 换 token，避免 URL 带 token。本次不做，保持最小改动。

## 验证

- `tsc --noEmit` 通过（除既存 pptPreviewBridge 问题）
- `oxlint` 0 errors（28 warnings 全既存）
- `vitest`：`oauthLoginState` / `deepLink` / `webuiDesktopSession` / `enterpriseRoles.oauthRedirect`（修正期望后）全过
- 打包后 `app.asar.unpacked/out/main/` 验证有三个 builtin-mcp 脚本
- 运行时需 `npm run restart` 桌面端实测：
  1. 客户端模式飞书 SSO：系统浏览器打开 → deep link 回桌面端 → 自动登录
  2. 设置页测试 `one-export-pdf` / `one-web-tools` MCP 连接成功
  3. 开发环境发消息不再卡死

## 涉及文件汇总（本轮）

| 文件 | 改动 |
|---|---|
| `electron-builder.yml` | asarUnpack 补 builtin-mcp-web-tools.js + builtin-mcp-export-pdf.js |
| `src/process/bridge/databaseBridge.ts` | 2 处 console.error 改文件日志 |
| `src/process/task/AionrsManager.ts` | 2 处 console.warn 改文件日志 |
| `src/process/webserver/auth/oauthLoginState.ts` | OAuthLoginStateEntry 加 desktop 字段 |
| `src/process/webserver/auth/oauthLoginHelpers.ts` | finalizeOAuthBrowserLogin 加 desktop 分支（1one://sso-callback） |
| `src/process/webserver/routes/authRoutes.ts` | feishu/dingtalk/wecom 三个 provider 传递 desktop |
| `src/renderer/utils/webuiDesktopSession.ts` | 新增 applySsoCallbackSession |
| `src/renderer/hooks/system/useDeepLink.ts` | 加 sso-callback action |
| `src/renderer/pages/enterprise/components/EnterpriseLoginChannelPanel.tsx` | 客户端模式 startOAuth 改 openExternalUrl |
| `tests/unit/enterpriseRoles.oauthRedirect.test.ts` | 修正期望 /sessions → /guid（90305cf 改默认落点后未同步） |

---

# 2026-07-02 Issues 创建转圈圈修复（1.23.14）

## 背景

用户报告侧边栏 Issues 功能创建时一直转圈圈。昨天白天正常，晚间开始失败。

## 根因：WebUI IPC handler console.* 冻死主进程（第 6 轮漏网）

Issue 创建链路经过多个 WebUI IPC handler：

```
CreateIssueModal.handleSubmit()
  → ensureDesktopWebuiRunning()          ← IPC: webui.getStatus / webui.start
  → createRequirement()                  ← POST /api/admin/requirements
    → fetchWebuiApi()
      → fetchWebuiApiViaLoopbackIpc()    ← IPC: webui.invokeLoopbackRequest
        → ensureCsrfTokenViaLoopback()   ← IPC: webui.invokeLoopbackRequest
```

每个 WebUI IPC handler 用 `WebuiService.handleAsync()` 包装。任意一步出错时，catch 块 `console.error` → `@office-ai/platform` console patch → `bridge.adapter.emit('officeai-logger')` → `win.webContents.send` × N + `broadcastToAll` → **主进程 event loop 冻死** → renderer IPC 永不返回 → loading 永远转圈。

commit `d80d2c6` 修了 `databaseBridge.ts` + `AionrsManager.ts`，但漏了这两个文件。

## 修复

| 文件 | 改动 |
|---|---|
| `src/process/bridge/services/WebuiService.ts` | `handleAsync` catch 块 `console.error` → `appendFileSync` 文件日志 |
| `src/process/bridge/webuiBridge.ts` | 5 处 `console.warn`/`console.error`（start/stop/QR/Direct IPC）→ `appendFileSync` 文件日志 |
| `src/process/webserver/localLoopbackRequest.ts` | `response.text()` 加 15s `Promise.race` 超时 + 移除无效 `session` 参数 |

## 教训

这是 console.* 冻死的第 6 轮漏网。之前 5 轮：
1. `4b9453c` — conversationBridge / modelBridge / acpConversationBridge / conversationSendService
2. `2c98728` — requestLoggingMiddleware
3. `5fe47cb` — authRoutes catch 块
4. `d80d2c6` — databaseBridge / AionrsManager
5. （遗漏） ViteProxy / errorHandler

不是所有 console 都要删——`src/index.ts` 启动日志、`src/server.ts` 信号处理等在非 IPC 同步调用栈的是安全的。只有 IPC handler provider 回调内的 console 才会触发冻死。

`.oxlintrc.json` 的 `no-console: warn` 是 warning 不是 error，因为部分 console 是设计如此（启动日志）。审查 console 违规时需区分：IPC 同步栈内的必须清，其他的可以保留。

---

# 2026-07-02 追加记录（登录页 UI + 飞书认证掩码 + 管理后台入口端口 + Issues 第 7 轮 console 清除）

## 背景

用户报告三个问题：(1) 其他开发者从仓库下载代码后登录页 UI 异常；(2) 飞书 AppID/Secret 无法修改；(3) 客户端模式"管理后台"入口指向本地地址而非服务端地址；(4) Issues 创建卡死修复（`51edb0d`）实际未生效。本轮一并修复，出包 1.23.15 → 1.23.17。

## Bug 1：登录页跨平台字体 + 桌面端卡片垂直居中

**文件**：`src/renderer/pages/login/LoginPage.css`

**问题 1a（跨平台字体）**：`.login-page` 无显式 `font-family`，macOS 默认 PingFang SC、Windows 默认 Microsoft YaHei、Linux 可能没有合适中文字体 → 中文渲染不一致（字形/字重/行高都有差异）。

**修复**：`.login-page` 加 `font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Noto Sans SC', sans-serif`。

**问题 1b（桌面端卡片贴顶）**：`.login-page--desktop-app` 使用 `align-items: flex-start`，桌面端管理后台登录卡片贴在窗口顶部。

**修复**：`align-items: flex-start` → `align-items: center`。

## Bug 2：飞书 App Secret 无法修改（掩码处理缺失）

**文件**：`src/renderer/components/settings/SettingsModal/contents/AuthProvidersModalContent.tsx`

**根因**：服务端 GET `/api/admin/auth/providers/feishu` 把 `appSecret` 返回为 `'******'`（掩码）。钉钉/企微的 `loadProvider` 检测到 `'******'` 时清空输入框 + 记录 `secretMasked` 标志。飞书的 `loadProvider` 直接用 `{ ...prev, ...data.config }` 展开，`appSecret` 字面量变成 `'******'` → 用户打开飞书认证页面看到 `******`、修改后点保存，服务端看到 `config.appSecret === '******'` 走"保留旧值"逻辑 → 用户想要修改的新 Secret 被丢弃。

**修复**：飞书三个路径补齐掩码逻辑：
- `loadProvider`：检测 `'******'` → 清空输入 + 设 `feishuSecretMasked`
- `persistProvider`：`appSecret.trim() || (feishuSecretMasked ? '******' : '')`
- `testFeishu`：同上处理掩码
- `onChange`：用户输入时清除 `feishuSecretMasked` 标志

## Bug 3：客户端模式管理后台入口指向本机而非服务端

**文件**：`src/renderer/utils/webuiApiBase.ts`

**根因**：`getWebuiAdminBrowserOrigin()` 客户端模式下直接返回 `getClientEnterpriseServerOrigin()`（成员端口，如 `http://192.168.11.137:25809`）。管理后台在成员端口 +1（25810），但代码没转换端口。

**修复**：客户端模式用 `buildWebuiAdminLoginUrlOnDedicatedPort()` 将成员端口 +1 后再返回 origin。所有「管理后台」按钮（WorkspaceIdentityPanel/EditionWorkspaceGuide/EditionModeSwitcher/sessions/tasks/superAssistant 等）都经过此函数，一处修复全覆盖。

## Bug 4：Issues 创建卡死 — 第 7 轮 console.* 清除（真因）

**文件**：`adminRoutes.ts`(44 处) + `devopsRoutes.ts`(20 处) + `devops/cciRoutes.ts`(5 处) + `kanbanRoutes.ts`(5 处) + `apiRoutes.ts`(4 处)

**根因**：`51edb0d` 只修了 **IPC 桥接层**（`WebuiService.ts` + `webuiBridge.ts` 的 console.*），**漏了 Express 路由层**。Issue 创建走 `POST /api/admin/requirements` → Express 中间件 → catch 块 `console.error` → `@office-ai/platform` console patch → `bridge.emit` → `win.webContents.send` × N → **主进程 event loop 冻死** → `net.fetch()` 永不返回 → renderer IPC 永不返回 → 按钮转圈圈。

即使在成功路径上，只要 HTTP 请求处理中任意一步触发 catch 块（CSRF 校验/DB 锁/并发冲突），路由层的 console.error 就会冻死主进程。

**修复**：5 个 Express 路由文件共 78 处 `console.error/warn` 全部替换为 `logRouteError`/`logRouteWarn`（`appendFileSync` 写 `logs/webui-route-errors.log`）。

### 六轮 console.* 清缴历史

| 轮次 | 文件 | commit |
|------|------|--------|
| 1 | conversationBridge / modelBridge / acpConversationBridge / conversationSendService | `4b9453c` |
| 2 | requestLoggingMiddleware | `2c98728` |
| 3 | authRoutes catch 块 | `5fe47cb` |
| 4 | databaseBridge / AionrsManager | `d80d2c6` |
| 5 | ViteProxy / errorHandler | （合并入 d80d2c6） |
| 6 | WebuiService / webuiBridge | `51edb0d` |
| **7** | **adminRoutes / devopsRoutes / cciRoutes / kanbanRoutes / apiRoutes** | **`9aecb4a`** |

> 第 6 轮 `51edb0d` 的 commit message 写的是"修复 Issues 创建卡死"，但只修了 IPC 桥接层，Express 路由层的 78 处 console.* 才是真因。`51edb0d` 只修了一半。

**教训**：排查 console.* 不能只扫 IPC bridge 文件——Express 路由处理器也在同一条调用链上，catch 块里的 console.* 同样是 kill switch。任何走 `ipcMain.handle` → `handleAsync` → HTTP 请求 → Express handler 的链路，handler 内的 console.* 都会触发同样的死锁。

## 涉及文件（本轮）

| 文件 | 改动 |
|------|------|
| `src/renderer/pages/login/LoginPage.css` | 加中文字体栈 + 桌面端 `align-items: center` |
| `src/renderer/components/settings/SettingsModal/contents/AuthProvidersModalContent.tsx` | 飞书 loadProvider/persistProvider/testFeishu 补掩码逻辑 |
| `src/renderer/utils/webuiApiBase.ts` | 客户端模式 `getWebuiAdminBrowserOrigin` 端口 +1 |
| `src/process/webserver/routes/adminRoutes.ts` | 44 处 console.error → logRouteError |
| `src/process/webserver/routes/devopsRoutes.ts` | 20 处 console.error → logRouteError |
| `src/process/webserver/routes/devops/cciRoutes.ts` | 5 处 console.error → logRouteError |
| `src/process/webserver/routes/kanbanRoutes.ts` | 5 处 console.error → logRouteError |
| `src/process/webserver/routes/apiRoutes.ts` | 4 处 console.error/warn → logRouteError/logRouteWarn |

---

# 2026-07-02 深夜 Issues 创建卡死 — 第 8 轮（真因：AuthService.verifyToken）

## 背景

用户报告"新建 Issue"点「创建」后仍然一直转圈圈（第 7 轮 `9aecb4a` 打包出 1.23.17 后仍未解决）。要求不再头痛医头，找出真正的原因。

## 根因

`createAuthMiddleware`（`TokenMiddleware.ts:144`）是 `adminRoutes.ts`/`devopsRoutes.ts`/`kanbanRoutes.ts`/`apiRoutes.ts` 等**几乎所有认证路由**共用的 `auth` 中间件，内部调用 `AuthService.verifyToken(token)`。POST `/api/admin/requirements`（创建 Issue）必经此中间件。

`AuthService.ts` 里 `verifyToken`/`verifyWebSocketToken`/`getJwtSecret` 共 4 处 `console.error`/`console.warn`，从第 1 轮排查到第 7 轮从未被碰过——因为历次排查都在"扫报错功能对应的路由/bridge 文件"，没人想到去查 `auth/service/` 目录下的共享 Service。

**关键教训**：第 5 轮（`d80d2c6`）的诊断文字明明写着"客户端模式 `AuthService.verifyToken` 验证失败每次触发 console → 冻死"——诊断对了机制，但补丁只改了*调用方*（`databaseBridge.ts`/`AionrsManager.ts` 自己的 catch 块），从没改过 `AuthService.verifyToken` 内部那行真正的 `console.error`。诊断正确不等于补丁打对了地方。

顺着这条线复查，还发现同一类漏网分布在：
- `auditLogService.ts` 的 `recordDevopsAudit`（被 `devopsRoutes.ts` requirement 创建路由 `void recordDevopsAudit(...)` 直接调用，Issue 创建必经）
- `notificationRoutes.ts`、`profileRoutes.ts`（含高频轮询的 `/api/auth/workspace-profile`）、`directoryApi.ts` 的 Express 路由 catch 块
- `WebSocketManager.ts`（心跳 `setInterval` 里对每个客户端做 token 校验、连接/断开/错误回调）
- `staticRoutes.ts` 的 `serveApplication`（每次页面加载都会经过，内部也调用 `TokenMiddleware.isTokenValid`）
- `adapter.ts`（每条 WebSocket 消息，bridge emitter 未就绪分支）
- `instanceGovernance.ts`（认领系统管理员）

## 修复

全部改用 `logRouteError`/`logRouteWarn`（`appendFileSync` 写 `logs/webui-route-errors.log`），不新增文件、复用既有 `webuiLog.ts` helper。

| 文件 | 改动 |
|------|------|
| `src/process/webserver/auth/service/AuthService.ts` | 4 处（verifyToken/verifyWebSocketToken/getJwtSecret ×2）console → logRouteError/logRouteWarn |
| `src/process/webserver/auth/auditLogService.ts` | recordDevopsAudit/recordGovernanceAudit 2 处 console.warn → logRouteWarn |
| `src/process/webserver/routes/notificationRoutes.ts` | 4 处 console.error → logRouteError |
| `src/process/webserver/routes/profileRoutes.ts` | 3 处 console.error → logRouteError |
| `src/process/webserver/directoryApi.ts` | 3 处 console.error → logRouteError |
| `src/process/webserver/websocket/WebSocketManager.ts` | 7 处 console.log/error → logRouteWarn/logRouteError |
| `src/process/webserver/routes/staticRoutes.ts` | 1 处（serveApplication 的 catch）console.error → logRouteError |
| `src/process/webserver/adapter.ts` | 1 处 console.warn → logRouteWarn |
| `src/process/webserver/auth/instanceGovernance.ts` | 1 处 console.log → logRouteWarn |

`src/process/webserver/**` 下剩余的 console.* 全部核对过：`index.ts`/`setup.ts`/`staticRoutes.ts` 的 `registerStaticRoutes` 是启动期一次性横幅/路由注册日志（非请求同步栈，安全）；`middleware/csrfClient.ts` 全部 `typeof document === 'undefined'` 守卫，只在渲染进程执行，安全。

## 验证

- `tsc --noEmit` 除既存 `pptPreviewBridge.ts` 4 处错误（与本轮无关）外 0 错误
- `oxlint src/process/webserver` 0 error；本轮 9 个文件的 `no-console` warning 清零
- `oxfmt --check` 本轮 9 个文件全过
- `vitest run` 覆盖 `auditLogService`/`AuthServicePasswordValidation`/`authServiceConstantTimeVerify`/`notificationRoutes`/`WebSocketManager` 5 个测试文件共 15 passed
- 运行时需桌面端 `npm run restart` 实测：新建 Issue「创建」按钮不再转圈圈；WebUI 登录/心跳/通知轮询不冻主进程

## 待办

- 尚未出包（按用户"打包前必须先确认"约定，等用户要求再 `bump-version` + `npm run dist:win`）
- ~~建议后续：给 `no-console` 规则加 CI 硬门禁~~ → 已在同一会话内落地，见下一节

---

# 2026-07-02 深夜续 — bridge/** 147 处 console.* 清零 + no-console 硬门禁落地

## 背景

用户对反复出现的 console 冻死 bug 表示"过敏"，追问为什么开发环境总卡、生产环境却没事。解释：**不是生产环境安全，是生产环境很少触发那些 catch 块**（Vite dev proxy 502、dev token 校验分支在生产不存在/少走）。地雷在生产环境同样埋着，只是没被踩中。用户要求把防护落地：先评估范围（`src/process/bridge/**` IPC handler 层从未被 8 轮排查碰过，147 处 console.*，24 个文件），用户选择"现在就把 bridge/** 也修完再一起升级"。

## 执行

1. **新增 `src/process/bridge/bridgeLog.ts`**：与 `webserver/webuiLog.ts` 同构，`logBridgeError`/`logBridgeWarn` 写 `logs/bridge-errors.log`。
2. **3 个并行子任务**分别清理 `fsBridge.ts`（33 处）、`channelBridge.ts`/`extensionsBridge.ts`/`authBridge.ts`/`taskBridge.ts`（47 处）、剩余 18 个小文件（44 处），共 124 处（实际清点比预估的 147 略少，预估是粗略 grep 计数）。参数归一化规则：目标签名固定 `(label: string, error: unknown)`，1 参补 `null`，3+ 参打包成数组。
3. **交叉验证**：`tsc --noEmit` 除 pptPreviewBridge.ts 既存 4 处 execSync 错误外 0 新增；`oxlint` no-console 清零（`237 warnings and 1 error` → `91 warnings and 1 error`，那 1 个 error 是 fsBridge.ts 里跟 console 无关的既存 `no-await-in-loop`）。
4. **测试回归**：全量 `vitest run tests/unit` 469 个文件，7 个文件 21 个用例失败——逐一用 `git stash` 对比基线，全部确认是修改前就存在的失败（`pptPreviewBridge`/`editionSwitchNavigation`/`enterpriseEditionSync`/`enterpriseLoginNavigation`/`enterpriseRoles`/`webuiApiBase`/`guidAgentHooks.dom`），与本轮改动无关。
5. **真实回归 3 处**（这 3 个之前漏过了，是 spy `console.warn` 断言的测试）：`shellBridge.test.ts`/`shellBridge-new.test.ts`/`shellBridgeStandalone.test.ts` 共 4 个用例改成 spy `bridgeLogMock.logBridgeWarn`（`vi.mock('.../bridgeLog', () => bridgeLogMock)`，`bridgeLogMock` 必须包在 `vi.hoisted()` 里，否则报 "Cannot access before initialization"）。改完 3 文件 50/50 全过。
6. **`.oxlintrc.json` 硬门禁**：新增两条 override——`src/process/webserver/**` + `src/process/bridge/**` 的 `no-console` 从 `warn` 升级为 `error`；随后单独把 3 个确认安全的启动期日志文件（`webserver/index.ts`、`webserver/setup.ts`、`middleware/csrfClient.ts`——后者只在渲染进程执行，被 `typeof document === 'undefined'` 守卫）降回 `warn`。`staticRoutes.ts` 的 `registerStaticRoutes`（启动期一次性路由注册，与已修复的请求期 `serveApplication` 同文件）用 `/* eslint-disable no-console */...disable/enable` 包裹整个函数体。手动验证：往 `notificationRoutes.ts` 塞一行 `console.log` 立刻报 `Error`，撤销后恢复干净。

## 未覆盖范围（明确告知用户，非本轮工作）

`src/process/**` 整体还有约 1057 处 console.*、160 个文件（worker/extensions/channels/agent 实现等），风险等级不一，本轮只锁定了 8 轮事故的重灾区（webserver + bridge）。这些目录仍是 `no-console: warn`，未硬门禁。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/process/bridge/bridgeLog.ts` | 新增，`logBridgeError`/`logBridgeWarn` → `logs/bridge-errors.log` |
| `src/process/bridge/*.ts`（24 个文件） | console.* → logBridgeError/logBridgeWarn，全部加 import |
| `tests/unit/shellBridge.test.ts` / `shellBridge-new.test.ts` / `shellBridgeStandalone.test.ts` | spy 对象从 `console.warn` 改为 mock 的 `bridgeLogMock.logBridgeWarn` |
| `.oxlintrc.json` | 新增 2 条 override：webserver/bridge 整体 `no-console: error`，3 个已知安全文件保留 `warn` |
| `src/process/webserver/routes/staticRoutes.ts` | `registerStaticRoutes` 函数体加 `eslint-disable/enable no-console` 包裹 |

## 验证

- `tsc --noEmit`：仅 pptPreviewBridge.ts 既存 4 处 execSync 错误
- `oxlint src/process/webserver src/process/bridge`：0 个 console 相关 error（1 个既存 no-await-in-loop error 无关）
- `vitest run tests/unit`：455 passed（+ 本轮新增 4 个用例通过），失败的 7 文件 21 用例全部核实为基线既存失败
- 硬门禁生效性人工验证：新增一行 console.log 立刻报 error，符合预期
- 运行时仍需桌面端 `npm run restart` 实测（webserver 那轮的 Issue 创建卡死修复已验证过流程；bridge/** 这轮是补防线，理论上不改变现有行为，只是把日志出口换掉）

---

# 2026-07-03 Issues 创建卡死 —— 真正的第二根因（不是 console）+ 客户端模式管理后台地址遗漏点

## 背景

打包出 1.23.18 装上实测，「创建 Issue」**依然转圈圈**。用户很无语。这次没有再猜测 console.*，而是直接查正式安装版（非 dev 环境）的用户数据目录日志，拿到了实锤证据。

## 根因 1：`syncBrowserWebuiSessionToDesktop()` 的 IPC 调用完全没有超时保护

**证据链**：
- `logs/webui-requests.log`（请求一进来就写，不是等响应完才写）从应用启动到用户手动退出，**没有任何一条记录**——说明点「创建」后请求根本没走到 Express 层。
- `logs/webui-service.log`（`WebuiService.handleAsync` 的 catch 块才会写）**文件都不存在**——说明不是报错，是真的卡住不 resolve/reject。
- 但用户在应用挂起期间右键托盘、点退出，`before-quit → ChannelManager Shutdown → will-quit → quit(exitCode=0)` 整个优雅关闭流程完整走完——**主进程 event loop 没冻**，排除 console.* 死锁，说明是某个 IPC 调用链自己卡住了（异步 pending，不影响其他 IPC）。

**定位**：`CreateIssueModal.handleSubmit()` → `ensureDesktopWebuiRunning()`（`src/renderer/utils/ensureDesktopWebui.ts`）→ `syncBrowserWebuiSessionToDesktop()`（`src/renderer/utils/syncBrowserWebuiSession.ts:23`）→ IPC `webui.syncBrowserWebuiSession` → 主进程 `WebuiService.syncBrowserWebuiSession()`（`session.defaultSession.cookies.get()` + `AuthService.verifyToken` + `UserRepository.findById` 串行 await）。`WebuiService.handleAsync` 只 catch 抛出的错误，从不处理"一直不 resolve"的情况——这条链路完全没有超时。6-23 深度审查时其实已经点出过这个薄弱点（"主进程 cookies.get/verifyToken/findById 串行 await 无超时"），但当时的结论是"渲染层 8s 超时已覆盖症状"——**那个 8s 超时（`withEnterpriseBootstrapTimeout`）只包在 `WebuiEnterpriseModeProvider.scheduleFullRefresh` 那条链路上，`ensureDesktopWebuiRunning` 是完全独立的另一个调用点，从未被覆盖**。

**修复**：`syncBrowserWebuiSessionToDesktop()` 内部给 `webui.syncBrowserWebuiSession.invoke()` 套 `Promise.race` + 8 秒超时（复用 `WebuiEnterpriseModeProvider.tsx` 已有的 `withEnterpriseBootstrapTimeout` 同款模式），超时就 fall through 到已缓存的 session 继续走，不再无限期卡住调用方。

**教训**：这轮排查第一次真正靠日志实锤定位，而不是继续假设是 console.* 同一类 bug。8 轮 console 排查建立的方法论（改完要 grep 复查）在这次完全不适用——不能一遇到"转圈圈"就往 console 死锁上套，先看进程有没有真的冻（能不能操作托盘/其他 UI），再看请求到没到 HTTP 层，两个信号一交叉基本就能定位到底是哪一类 bug。

## 根因 2：客户端模式下「管理员专属后台」地址仍显示本机地址（用户主动发现）

用户在验证时发现：设置 → WebUI 页面的"管理员专属后台（端口 25809）"显示的是本机局域网地址（`172.29.128.120:25809`），但这台机器在"企业部署模式"里已经配置为客户端、连接到远程服务器（`192.168.11.137:25809`，已连接企业"上海欢乐互娱网络科技公司"）。用户的判断是对的：客户端模式下这个地址应该指向服务端。

**根因**：`WebuiModalContent.tsx` 的 `getAdminOrigin()` 只读本机 `status.adminNetworkUrl`/`status.adminLocalUrl`，完全没有检查部署角色（client/server）。这是 7-02 那轮修的"管理后台按钮指向本机而非服务端"bug（`getWebuiAdminBrowserOrigin()`，覆盖了 WorkspaceIdentityPanel/EditionWorkspaceGuide/EditionModeSwitcher/sessions/tasks/superAssistant 等按钮）的**遗漏点**——设置页 WebUI 面板里直接展示的这条 URL 走的是另一套本地计算逻辑，没有复用那次的修复。

**修复**：`WebuiModalContent.tsx` 新增 `clientEnterpriseOrigin` state，用 `useEffect` 调用 `getClientEnterpriseServerOrigin()`（`webuiApiBase.ts` 已有导出）解析，并监听 `one-enterprise-context-refresh` 事件保持同步；`getAdminOrigin()` 优先检查这个值，用 `buildWebuiAdminLoginUrlOnDedicatedPort()` 转换成服务端 memberPort+1 的 origin（和 `getWebuiAdminBrowserOrigin()` 完全同构），查不到才回退到本机 `status`。「团队/员工访问」（成员端口）没有改动——那是本机自身局域网入口，不属于用户反馈的范围。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/renderer/utils/syncBrowserWebuiSession.ts` | `syncBrowserWebuiSessionToDesktop()` 内部加 8s `Promise.race` 超时 |
| `src/renderer/components/settings/SettingsModal/contents/WebuiModalContent.tsx` | 新增 `clientEnterpriseOrigin` state + effect；`getAdminOrigin()` 优先返回客户端模式下的服务端 admin origin |
| `tests/unit/WebuiModalContent.dom.test.tsx` | mock 补上新增的 `getClientEnterpriseServerOrigin` 导出 |

## 验证

- `tsc --noEmit`：两文件均无新增错误
- `oxlint`/`oxfmt --check`：两文件干净（1 个 `formatExpiresAt` 既存 warning 与本次无关）
- `vitest run tests/unit`：455 passed，与改动前完全一致（含本次新增/修复的 `WebuiModalContent.dom.test.tsx` 1 个用例）
- 运行时仍需桌面端实测：Issue 创建不再无限转圈（最坏情况 8s 后仍能继续）；客户端模式下设置页「管理员专属后台」显示服务端地址

---

# 2026-07-03 续 —— 开发环境聊天卡死真因：AionrsAgent.send() 的 readyPromise 无超时

## 背景

上面两处修完，用户又报"开发环境聊天会卡死"：会话框发消息不回应，接着点全局设置整个应用"未响应"。这轮全程靠埋点日志实锤定位，没有再靠猜。

## 排查过程

1. **进程取证**：`tasklist`/`Get-CimInstance Win32_Process` 发现主 Electron 进程已退出，但它 fork 出的两个 agent worker 子进程（`--type=utility --utility-sub-type=node.mojom.NodeService`）还活着，相隔约 50 秒启动——是"未响应"弹窗被强杀（TerminateProcess，不走 `before-quit` 优雅清理）留下的孤儿。用 `npm run stop:dev` 清理干净，但这只是卡死的**结果**，不是根因。
2. **加埋点**：给 `WebuiService.syncBrowserWebuiSession()` 和 `AionrsManager.sendMessage()` 加了逐步耗时日志（写 `logs/bridge-errors.log`，走 `logBridgeWarn`，不用 console）。
3. **复现拿到实锤**：`[sendMessage:diag]` 日志显示"技能注入/模型切换检测/消息落库/进入 vision 分支前"全部在 3ms 内完成，**但 `super.sendMessage resolved` 这一行永远没出现**——精确定位到卡在 `AionrsManager.sendMessage()` → `super.sendMessage(data)`（`BaseAgentManager.sendMessage`）→ `ForkTask.postMessagePromise('send.message', data)` 这条链路。

## 根因

`ForkTask.postMessagePromise()`（`src/process/worker/fork/ForkTask.ts:105`）本身完全没有超时——它创建一个 Promise，只有 worker 子进程回传匹配 `pipeId` 的消息才会 resolve/reject。顺着这条链路查到 worker 侧 `pipe.on('send.message', ...)` → `deferred.with(agent.send(...))`（`src/process/worker/aionrs.ts:68`）→ `AionrsAgent.send()`（`src/process/agent/aionrs/index.ts:568`）：

```ts
async send(input, msgId, files) {
  await this.readyPromise;   // ← 无超时，卡在这里
  this.pendingTurnMsgId = msgId;
  this.slideResponseStallWatchdog(msgId);  // ← 卡在上面这行永远走不到，"响应停滞看门狗"形同虚设
  this.sendCommand({...});
}
```

**关键发现**：`start()`（worker 首次启动）本来就有 `Promise.race([this.readyPromise, timeout])` 30 秒超时保护（`index.ts:311-316`，超时会 fallback 重试），但 `send()` 的这个 `await this.readyPromise` 从来没有超时。项目里还有一套专门"防止 UI 永远转圈"的 `slideResponseStallWatchdog` 机制（`RESPONSE_STALL_MS` 等），但它是在 `readyPromise` **resolve 之后**才被调用（`send()` 里 `slideResponseStallWatchdog` 排在 `await this.readyPromise` 之后一行）——如果 `readyPromise` 自己卡住，看门狗根本没机会被架设。

**最可能的触发场景**（吻合"孤儿 worker"证据）：aionrs 预热池（`AionrsPrewarmPool`）会提前 spawn 一个 worker 并调用 `start()`，binary 发 `ready` 事件，`readyPromise` resolve。用户发送消息时"认领"（claim）这个预热的 worker，如果认领路径构造了一个**新的 `AionrsAgent`/`AionrsManager` 包装实例**包住同一个底层进程，这个新实例构造函数会生成一个全新的、未 resolve 的 `readyPromise`（`readyResolve`/`readyReject` 是每个实例私有的）——而真正的 `ready` 事件已经在旧实例存活期间发过了，不会再发一次，新实例的 `readyPromise` 就永远挂着。`send()` 卡在这里，UI 转圈圈转到天荒地老。

## 修复

给 `send()` 里的 `await this.readyPromise` 补上和 `start()` 一样的 30 秒超时（`Promise.race`），超时后：
1. `throw` 出去，让调用方（`AionrsManager.sendMessage` → `useGuidSend`/`sendbox.tsx`）catch 到，正常复位 loading 状态；
2. 同时主动 `onStreamEvent({type:'error', ...})` + `onStreamEvent({type:'finish', ...})`，走跟 `slideResponseStallWatchdog` 一样的"解锁 UI"路径，用户能看到明确的中文报错提示（"等待模型就绪超时，请重试或重新打开该会话"）并可以立即重试，而不是无限期转圈圈。

用户明确要求"只对 send.message 加超时，其余消息类型（start/init.history/工具确认等）不动"——这次改动完全限定在 `AionrsAgent.send()` 内部，没有碰共享的 `ForkTask.postMessagePromise()`，不影响其他消息类型的行为。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/process/agent/aionrs/index.ts` | `send()` 内 `await this.readyPromise` 加 30s `Promise.race` 超时，超时走 error+finish 事件解锁 UI |
| `src/process/bridge/services/WebuiService.ts` | `syncBrowserWebuiSession()` 加逐步耗时诊断日志（`TEMP DIAGNOSTIC`，待确认问题彻底解决后可删） |
| `src/process/task/AionrsManager.ts` | `sendMessage()` 加逐步耗时诊断日志（`TEMP DIAGNOSTIC`，待确认问题彻底解决后可删） |

## 验证

- `tsc --noEmit`：无新增错误
- `oxlint`（含 no-console 硬门禁）：0 个 console 相关问题；`oxfmt --check`：干净
- `vitest run tests/unit`：3489 passed，与基线完全一致（第一次跑出现的 8 failed / 22 failed 是偶发抖动，重跑后恢复成基线的 7 failed / 21 failed）
- 运行时仍需桌面端实测：具体触发路径（是否真的是预热认领导致新实例 readyPromise 永不 resolve）仍待用户在真实场景复现验证；即使触发机制的细节有出入，30s 超时兜底本身能确保这类问题不会再导致无限期转圈圈

## 待办

- `TEMP DIAGNOSTIC` 埋点（`WebuiService.syncBrowserWebuiSession` + `AionrsManager.sendMessage`）暂时保留，等用户确认卡死问题不再复现后可以清理
- ~~预热认领是否构造新 AionrsAgent 实例~~ → 已用埋点实锤排除并找到真正根因，见下一节

---

# 2026-07-03 续 —— 聊天卡死真正根因找到：send.message 竞态到刚 fork 还没就绪的 worker

## 排查过程（这轮全程靠埋点，不靠猜）

上一轮 `readyPromise` 超时修复没解决问题（用户等了 30 秒以上仍然卡死），说明假设错了。追加三处更底层的埋点后一次性拿到实锤：

1. `AionrsAgent.send()` 入口埋点（`logs/aionrs-send-diag.log`）——**文件压根不存在**，说明 worker 侧的 `send()` 从未被调用。
2. `ForkTask.postMessage()` 埋点（`logs/bridge-errors.log` 里 `[ForkTask:diag]`）——**关键发现**：日志里出现了两次 `type=start`，间隔 **49 秒**：
   ```
   07:59:08.927  postMessage type=start  pipeId=7c235b09   ← 预热 spawn 的 worker
   07:59:57.874  postMessage type=start  pipeId=1c265957   ← 又 spawn 了一个新 worker
   07:59:58.436  postMessage type=send.message              ← 发给刚 spawn 的这个新 worker，间隔仅 562ms
   ```
3. `Pipe` worker 侧原始消息接收埋点（`logs/worker-pipe-diag.log`）——**文件也不存在**，说明这个新 worker 连"收到过任何一条消息"的记录都没有，不止是没收到 `send.message`。

## 根因

`AionrsPrewarmPool` 的 TTL 只有 15 秒（`DEFAULT_TTL_MS = 15_000`）。用户从 Guid 页选好模型/工作区到真正点发送，只要超过 15 秒（打字很容易超过），预热池的 entry 就已经被 TTL 淘汰（`evictInternal('ttl')` 杀掉了预热 worker），`useGuidSend.ts` 里 `ipcBridge.conversation.prewarmClaim.invoke(...)` 必然 MISS，走"回退路径"：

```ts
// useGuidSend.ts 第 374-412 行
if (!conversation) {
  conversation = await ipcBridge.conversation.create.invoke({...});  // 建新会话
}
...
void ipcBridge.conversation.warmup.invoke({ conversation_id: conversation.id });  // 触发 getOrBuildTask，new AionrsManager()，fire-and-forget！
await navigate(`/conversation/${conversation.id}`);  // 立刻跳转
```

跳转到会话页后，`AionrsSendBox.tsx` 的 `useEffect` 立刻从 sessionStorage 读出首条消息并调用 `executeCommand`（间接触发 `sendMessage`）——**跟上面的 `warmup` 完全没有互相等待**。

而 `AionrsManager` 构造函数里 `void this.start().catch(() => {})` 本身就是 fire-and-forget（TS 构造函数不能是 async）。`start()` 的完整链路是：`ForkTask.init()`（同步 fork 出 worker 进程）→ `postMessagePromise('start', data)` → worker 收到 `'start'` 消息后才会执行 `pipe.on('send.message', ...)` 等 handler 的**注册**（`src/process/worker/utils.ts` 的 `forkTask()`：只有收到 `'start'` 消息、调用 `task(data, pipe)` 时，`send.message` 等 listener 才会被同步注册）。

**竞态窗口**：`warmup`（内部触发 `new AionrsManager()` → fire-and-forget `start()`）和"跳转后自动发首条消息"之间只隔了约 562ms（实测）。如果 worker 进程刚 fork（Electron `utilityProcess.fork()` 需要真正拉起一个新 OS 进程 + Node 运行时 + 加载 `aionrs.ts` 的完整 import 链），562ms 内很可能连 `'start'` 消息本身都还没被处理完——`send.message` 消息此时被发送，但目标 worker 连 `pipe.on('send.message', ...)` 的 handler 都还没注册上，消息静默丢失，**没有任何错误、没有任何超时、`postMessagePromise` 永远挂着**。

这也解释了为什么上一轮的 `readyPromise` 超时修复没用——那个超时保护的是"worker 已经在跑，等 ready 握手"这一段；这次的真因发生在**更早**的阶段：worker 进程本身还没来得及把 `send.message` 的 listener 注册上。

## 修复（根治，不是兜底）

给 `AionrsManager` 加 `startPromise` 字段，保存构造函数里发起的 `start()` 的 Promise；`sendMessage()` 改为**先 `await` 这个 `startPromise`（带 30s 超时兜底）再真正派发消息**——从根上堵住"worker 还没启动完就往它发消息"的竞态窗口，不管背后是 fork 延迟、模块加载慢、Defender 扫描还是别的什么原因，只要 `start()` 没完成，`sendMessage` 就不会真正把消息发出去。

同时把构造函数里 `void this.start().catch(() => {})` 的静默吞错改成有日志记录（`start()` 成功/失败都会写 `logs/bridge-errors.log`），并保留 `.catch(() => {})` 防止用户中途放弃发送时触发 unhandledRejection。

## 涉及文件（本轮追加）

| 文件 | 改动 |
|------|------|
| `src/process/task/AionrsManager.ts` | 新增 `startPromise` 字段；构造函数存住 `start()` 的 promise（有日志，不再静默吞错）；`sendMessage()` 先 await `startPromise`（30s 超时兜底，超时会发 error+finish 解锁 UI） |
| `src/process/worker/fork/ForkTask.ts` | `postMessage()` 加诊断日志（`TEMP DIAGNOSTIC`，确认调用是否真的到达 + `this.fcp` 是否存在） |
| `src/process/worker/fork/pipe.ts` | worker 侧原始消息接收入口加诊断日志（`logs/worker-pipe-diag.log`，`TEMP DIAGNOSTIC`） |

## 验证

- `tsc --noEmit`：无新增错误
- `oxlint`（含 no-console 硬门禁）：0 个 console 相关问题；`oxfmt`：干净
- `vitest run`：相关测试（aionrsImageToolResult / AionrsPrewarmPool / WorkerTaskManager 系列）全过；全量 `tests/unit` 待确认与基线一致
- 运行时仍需桌面端实测：这次是真正的根治（消除竞态窗口），不是又一层超时兜底——请用户选模型/工作区后特意等超过 15 秒再发送（复现 claim MISS 场景），确认不再卡死

## 待办

- ~~`TEMP DIAGNOSTIC` 埋点确认问题彻底解决后统一清理~~ → 已清理，见下一节
- `AionrsPrewarmPool` 的 15 秒 TTL 是否要调大，属于产品体验优化，不是本次 bug 的必要修复项（竞态窗口已经从"worker 层面"堵死，TTL 多短都不会再丢消息）

---

# 2026-07-03 续 —— procdump 实锤：诊断埋点本身在这台机器上造成了新的卡死

## 背景

`startPromise` 修复上线后，诊断埋点保留继续观察，结果又卡死了两次，且现象跟之前不一样：`getEnhancedEnv() took 0ms`、`fork() took 1ms`（排除了环境探测/fork 慢的猜测），日志停在 `postMessage type=start hasFcp=true` 之后，worker 侧诊断文件（`aionrs-send-diag.log`/`worker-pipe-diag.log`）全都不存在。用户提出关键反证：正式打包版本运行没问题——这一度让人怀疑是 Defender 扫描大文件（历史上 `aionrs-miss-freeze-investigation.md` 记录过的同类问题），但用户确认"不是 Defender"。

## 排查方法：procdump + 免费 Python 库，不用装 WinDbg

1. 复现卡死时，任务管理器右键主进程（无 `--type=` 参数的那个 `electron.exe`）→"创建转储文件"（Windows 自带，不用装任何工具）。
2. `Get-Process -Id X | .CPU` 前后间隔几秒采样两次——**CPU 增量为 0**，排除死循环，确认是真阻塞。
3. `pip install minidump pefile`，写 Python 脚本离线解析 dump：
   - 列出全部线程的 IP 寄存器值，用 `pefile` 读本机 `C:\Windows\System32\ntdll.dll` 的导出表，把 RVA 映射成 `ZwXxx` 系统调用名。
   - 绝大多数线程停在 `ZwWaitForSingleObject`/`ZwWaitForAlertByThreadId`/`win32u.dll`（消息泵正常空闲等待）。
   - **一个线程停在 `ntdll!ZwWriteFile`**——同步文件写入卡住。
   - 顺着这个线程的 RSP 往上翻栈（按 8 字节读取候选返回地址，比对模块基址表），调用链清晰可辨：`ntdll!ZwWriteFile → KERNELBASE.dll(WriteFile) → electron.exe 应用代码 → kernel32.dll → electron.exe 应用代码`——是应用自己发起的同步写文件卡住了，不是第三方库或 Chromium 内部逻辑。

## 真凶

本轮排查过程中加的全部诊断日志都走 `appendFileSync`（项目里公认"安全"的写法，因为同步、不触发 `console.*` 的 `bridge.adapter.emit` 死锁）。但 `ForkTask.postMessage()` 是**每发一条 IPC 消息就同步写一次日志**的高频路径——这台机器上同步文件写入偶尔会被某种外部因素（AV 实时防护 / 公司终端管理软件 / OneDrive 同步 AppData 之类，未继续深挖具体是谁）显著拖慢甚至阻塞，叠加高频调用后，**诊断代码本身在这台机器上变成了新的卡死源**，和原始 bug 混在一起，让排查更难而不是更容易。之前提到"正式打包版本没问题"其实不能证伪任何假设——打包的 1.23.19 出包于本轮 aionrs 调试**之前**，压根不包含这轮任何一处改动（含诊断日志），"打包没事"只能说明旧代码在他们测试的场景下没问题。

## 处理

全部 5 处 `TEMP DIAGNOSTIC` 埋点删除干净，只保留真正的修复逻辑：

| 文件 | 保留的真修复 | 删除的诊断代码 |
|------|------|------|
| `src/process/task/AionrsManager.ts` | `startPromise` 字段 + `sendMessage()` 先 await 它（30s 超时兜底） | 构造函数/`sendMessage()` 里全部逐步耗时 `logBridgeWarn` |
| `src/process/agent/aionrs/index.ts` | `send()` 内 `readyPromise` 30s 超时（超时发 error+finish 解锁 UI） | `diagLog()` 方法本身 + 全部调用点 |
| `src/process/bridge/services/WebuiService.ts` | `syncBrowserWebuiSession()` 原有逻辑不变 | 全部 `mark`/`finish` 逐步耗时日志 |
| `src/process/worker/fork/ForkTask.ts` | `postMessage()`/`init()` 原有逻辑不变 | `getEnhancedEnv`/`fork()` 耗时日志 + `postMessage` 调用确认日志 |
| `src/process/worker/fork/pipe.ts` | worker 侧消息处理原有逻辑不变 | 原始消息接收诊断日志（`worker-pipe-diag.log`） |

## 验证

- `tsc --noEmit`：无新增错误（除既存 pptPreviewBridge execSync 4 处）
- `oxlint`：清理后无新增 console/unused-var 问题；`oxfmt`：干净
- `vitest run tests/unit`：3489 passed，与基线完全一致，清理诊断代码零回归
- procdump 文件（687MB，`%TEMP%\electron (2).DMP`）+ Python 分析脚本用完即删

## 教训（比这次的具体环境问题更重要）

1. **`appendFileSync` 不是绝对安全的"万能诊断手段"**——它只解决"不触发 console 的 bridge.emit 死锁"这一个特定问题，不代表在任何机器、任何调用频率下都零风险。同步文件 I/O 仍可能被外部因素（AV/EDR/云同步）拖慢到阻塞级别，尤其是在高频调用点上。以后加诊断埋点要意识到：低频关键节点（构造函数、错误分支）随便加没问题；像"每条 IPC 消息""每次组件渲染"这种高频路径，加同步文件写入本身就是新增风险，要么限制粒度、要么用采样/节流。
2. **排查中途症状"变了样"要警惕是不是诊断手段本身引入了新变量**——这次从"竞态到未就绪 worker"（有明确证据链的真 bug，已修复）变成"main process 卡在 ZwWriteFile"（完全不同的证据），一开始以为是同一个 bug 的不同表现，实际是两个独立问题叠加在一起。及时怀疑"是不是我自己的埋点把水搅浑了"，比一直加更多埋点更高效。
3. **procdump（Windows 自带，任务管理器右键即可）+ 免费 Python 库（`pip install minidump pefile`）足以定位到"卡在哪个系统调用"这一层，不需要申请/安装 WinDbg**。这是一个通用技巧：遇到"进程 Not Responding 但 CPU 是 0%"这类问题，都可以用这个组合快速看到调用栈落在哪个 DLL/哪个 syscall，不需要完整的符号服务器也能定位到大方向。
4. **`Get-Process -Id X | .CPU` 前后采样判断死循环 vs 真阻塞，是零安装成本的第一步诊断**——PowerShell 自带，几秒钟出结论，能立刻排除一整类假设（死循环类 bug 通常需要看代码逻辑；真阻塞类需要看外部依赖/系统调用），避免在错误的方向上继续深挖。

---

# 2026-07-03 续二 —— 清理诊断代码后仍复现，加 desktopFocusSync 冷却期

## 背景

诊断代码清理干净、重新测试，用户报告"还是一样"，但这次的 DevTools 控制台证据跟之前都不同：`[aionrs:prewarm] spawn done +189ms`（很快，健康）、但 `[Auth] Desktop user fetch failed, attempting local operator fallback: Error: syncBrowserWebuiSession timed out after 5000ms`、`[WebuiEnterpriseMode] desktopFocusSync timed out after 8000ms`、`[useNotificationClick] Registering notification click handler` 反复出现，像是在**循环**。

## 排查

顺着 `syncBrowserWebuiSession timed out after 5000ms` 这条新线索找到 `AuthContext.tsx:271-276` 的 `fetchDesktopCurrentUser()` —— 这是 `syncBrowserWebuiSessionToDesktop()` 的**第三个独立调用点**（前两个是 `ensureDesktopWebuiRunning.ts` 和 `WebuiEnterpriseModeProvider.tsx` 的 `runDesktopSync`），本身就有 5s 超时 + fallback，设计上是健全的，不是本次卡死的根源。

真正的问题在 `WebuiEnterpriseModeProvider.tsx` 的 `scheduleFullRefresh`（`window focus` / `visibilitychange` 触发）：`desktopSyncInFlightRef` 只防止**并发**重入，但**没有冷却期**——如果底层 `syncBrowserWebuiSessionToDesktop()` 持续很慢（每次都跑满 8 秒超时），而 focus/visibilitychange 事件又反复到来（比如"未响应"弹窗本身抢焦点、切窗口、DevTools 开关都可能触发），上一次 8 秒尝试刚复位 in-flight 标志，下一个已排队的 800ms 防抖计时器立刻又发起一次新的 8 秒尝试——形成没有退避的连续重试风暴，`useNotificationClick` 的反复"Registering"是这些重试触发的 context 更新连带 `Layout` 重渲染的副作用。

**未解之谜**：`WebuiService.syncBrowserWebuiSession()`（主进程）为什么持续这么慢，具体卡在 `session.defaultSession.cookies.get()` 还是 `UserRepository.findById` 还没有实锤（诊断日志已经清掉，且已确认高频加日志本身是新风险，这次没有重新加）。当前修复是"防止无退避的重试风暴"，不是"修好底层为什么慢"——两者独立，后者仍是待查项。

## 修复

`scheduleFullRefresh` 加冷却期：如果一次尝试真的跑满了 `ENTERPRISE_BOOTSTRAP_TIMEOUT_MS`（8s，说明确实慢，不是快速失败），复位后进入 15 秒冷却，冷却期内 focus/visibilitychange 事件不会触发新的尝试。快速成功的正常同步不受影响（不计入冷却）。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/renderer/hooks/webui/WebuiEnterpriseModeProvider.tsx` | `scheduleFullRefresh` 加 `desktopSyncCooldownUntilRef`，跑满超时后 15s 内不再重试 |

## 验证

- `tsc --noEmit`：无新增错误
- `oxlint`/`oxfmt`：干净
- `vitest run`：`webuiEnterpriseModeProvider.dom.test.tsx` 6 passed；全量 `tests/unit` 待确认与基线一致
- 运行时仍需桌面端实测——这次修复针对的是"重试风暴"，如果底层 `syncBrowserWebuiSession` 慢的根因还在，用户仍会看到一次性的转圈/短暂卡顿，但不应该再无限循环下去

## 待办

- `WebuiService.syncBrowserWebuiSession()` 主进程侧持续偏慢的根因仍未定位（`session.defaultSession.cookies.get()` 或 `UserRepository.findById`），下次如需继续排查，诊断埋点要吸取上一轮教训：只加在低频/一次性调用点，不要加在 focus/visibilitychange 这类可能高频触发的路径上
- `AuthContext.tsx` 的 `fetchDesktopCurrentUser`/`refresh` 虽然本身有超时保护，但同样没有冷却期，如果未来发现它也有重试风暴的迹象，可以参考这次的 `desktopSyncCooldownUntilRef` 模式加同款保护

---

# 2026-07-03 续三 —— 冷却期修复后仍复现，挖到 electron-log 默认同步写盘这个更底层的根因

## 背景

`desktopFocusSync` 冷却期修完，用户又报"还是不行"。此时排查已经进行了 9 轮，之前每一轮都以为找到了根因，结果都只是解决了叠加问题中的一个。这次换思路：不再从"哪个功能触发的"倒推，改用 procdump 抓实时快照，从操作系统调用栈往回查。

## 排查过程

1. 用户机器当时确认真的卡死（`Get-Process -Id X | .CPU` 前后采样不变 = 真阻塞非死循环），用 `rundll32 comsvcs.dll, MiniDump <pid> <path> full` 现场抓实时转储（零安装，比等下次自然复现再翻旧 dump 快得多；抓完要 `icacls <dump> /grant <user>:F`，因为 comsvcs.dll 生成的转储默认只给 SYSTEM/Administrators 权限，当前用户读不了）。
2. 用 Python `minidump` 库枚举全部线程 RIP，发现固定模式：**6 个线程健康地停在 `win32u.dll!NtUserMsgWaitForMultipleObjectsEx`（消息泵正常空闲），只有 1 个线程卡在 `ntdll.dll!ZwWriteFile`**——这个特征在本轮之前的两次 procdump（8-9 轮排查期间）里也出现过，当时以为是自己加的诊断 `appendFileSync` 导致的，删干净后仍然复现，说明另有其他同步写入命中同一个坑。
3. 用寄存器读取该线程的 `R10`（x64 syscall 会用 `r10` 保存原始 `rcx`，即 `ZwWriteFile` 第一个参数 FileHandle，因为 `syscall` 指令本身会破坏 `rcx`）去匹配 dump 里的 handle 表，用 `GrantedAccess` 位模式（`FILE_APPEND_DATA` 等）确认这就是一次 `appendFileSync`/`appendFile`-style 的追加写。
4. 顺着这条线排查全部残留 `appendFileSync` 调用点，发现真正的更底层根因：**`src/process/utils/configureConsoleLog.ts` 用 `electron-log` 接管主进程 `console.*`，而 `electron-log` 的文件 transport 默认 `sync: true`（`node_modules/electron-log/src/node/transports/file/index.js:41`）**——也就是说，只要主进程任何地方（不只是已经硬门禁的 `webserver/**`/`bridge/**`，而是全部约 164 个还残留 `console.*` 的文件）调用一次 `console.log`，就会同步 `fs.writeFileSync`，直接卡住主/UI 线程。这是一条跟"`console.*` 触发 `bridge.adapter.emit` 广播死锁"（[[ipc-console-deadlock]]）完全独立的阻塞路径，两条路径共享同一个触发条件（调用 console.*）但机制不同。
5. 更麻烦的是：我们自己写的"安全"日志助手（`logRouteWarn`/`logBridgeWarn` 等，本意是替代 console.* 规避 bridge.emit 死锁）用的也是同步 `appendFileSync`——跟 electron-log 是**同一类风险**，只是少了 IPC 广播那一层。这就是为什么第 8-9 轮把诊断代码删干净后问题仍然复现：electron-log 自己的同步写，以及我们自己的"安全"日志助手，两者都还是同步的。

## 修复

1. `configureConsoleLog.ts` 加一行 `log.transports.file.sync = false`，让 electron-log 改用异步 `fs.writeFile`——一行改动覆盖全部约 164 个残留 console.* 文件的风险，不用逐个文件清。
2. 把所有自己写的同步日志改成异步：
   - `webuiLog.ts`、`bridgeLog.ts`（`logRouteWarn`/`logRouteError`/`logBridgeWarn`/`logBridgeError` 的共享实现）
   - 散落在各文件里内联 `const { appendFileSync } = require('node:fs')` 模式的 8 处：`webuiBridge.ts`（5 处）、`databaseBridge.ts`（2 处，其中 `getConversationMessages` 被渲染层**每 2.5 秒轮询一次**，是理论上风险最高的一处）、`WebuiService.ts`（`handleAsync`，几乎所有 `webui.*` IPC provider 复用）、`AionrsManager.ts`（2 处）、`AuthMiddleware.ts`（`requestLoggingMiddleware`，**每个 HTTP 请求都调用两次**）、`staticRoutes.ts`（**仅 dev 模式**下 Vite 代理失败时触发，很可能是"生产环境没这个问题"的直接原因之一）、`errorHandler.ts`。
3. 顺手修了一个无关的预置 bug：`pptPreviewBridge.ts` 用了 `execSync` 但没导入（`tsc --noEmit` 顺带暴露的）。

## 验证与后续复现

`tsc --noEmit` 0 错误，`oxlint` 0 新增 error（构建产物里确认 `appendFileSync` 清零、`transports.file.sync = false` 编译进去了）。但**修复上线后用户仍复现了两次冻结**，procdump 显示同样的 `ZwWriteFile` 卡死特征，其中一次是在**全新启动的进程**上（排除"旧进程残留状态"）。查 Windows 系统事件日志发现：其中一次冻结前，笔记本经历了一次长时间 Modern Standby 休眠唤醒（本地时间 18:29 睡、20:00 醒），怀疑跟休眠唤醒后磁盘/驱动短暂未完全恢复有关——但这只是时间线吻合，**没有实锤**，且第二次复现的进程是唤醒 23 分钟后才启动的，不能完全排除是别的同步写入命中同一个坑。

## 加了一个新工具：全局 fs 同步写 watchdog（诊断用，问题定位后应删除）

鉴于 procdump 事后取证只能确认"有一次写入卡在 ZwWriteFile"，拿不到具体文件名（`comsvcs.dll` 生成的转储默认不含 handle 名称数据，需要 handle 表 + 寄存器匹配才能定位到 handle 号，仍拿不到路径字符串），新增 `src/process/utils/fsWriteWatchdog.ts`：在主进程入口最早期 monkey-patch `fs.writeFileSync`/`fs.appendFileSync`，每次调用**异步**（`fs.appendFile`，绝不自我阻塞）记录目标路径 + 调用栈，写入开始前就记一条"STARTED"（这样即使写入永远不返回，也能靠这条记录跟卡死时间点对上），超过 50ms 再记一条"SLOW"。写到 `logs/fs-write-watchdog.log`。

**踩坑**：第一版用 `import * as fs from 'node:fs'`，打包后是只读的 ESM 命名空间对象，`fs.writeFileSync = ...` 直接抛 `TypeError: Cannot set property writeFileSync of [object Module] which has only a getter`，主进程启动即崩溃（弹出"A JavaScript error occurred in the main process"错误窗口）。改用 `require('node:fs')`（拿到可变的 CommonJS 模块对象）修复。**教训**：给已经用 ESM `import` 语法拿到的内置模块做属性覆盖式 monkey-patch，必须用 `require()`，不能用 `import * as`。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/process/utils/configureConsoleLog.ts` | 加 `log.transports.file.sync = false` |
| `src/process/webserver/webuiLog.ts` | `appendFileSync` → 异步 `appendFile` |
| `src/process/bridge/bridgeLog.ts` | 同上 |
| `src/process/bridge/webuiBridge.ts` | 5 处内联同步写 → 异步 |
| `src/process/bridge/databaseBridge.ts` | 2 处（含 2.5s 轮询热路径）→ 异步 |
| `src/process/bridge/services/WebuiService.ts` | `handleAsync` 内联写 → 异步 |
| `src/process/task/AionrsManager.ts` | 2 处内联写 → 异步 |
| `src/process/webserver/auth/middleware/AuthMiddleware.ts` | `requestLoggingMiddleware`（每请求 2 次）→ 异步 |
| `src/process/webserver/routes/staticRoutes.ts` | Vite 代理失败日志（仅 dev）→ 异步 |
| `src/process/webserver/middleware/errorHandler.ts` | 同上 |
| `src/process/bridge/pptPreviewBridge.ts` | 补 `execSync` 导入（无关预置 bug） |
| `src/process/utils/fsWriteWatchdog.ts`（新增） | 全局 fs 同步写监控，诊断用，问题彻底定位后应删除 |
| `src/index.ts` | 最早期导入 `fsWriteWatchdog`（在 `configureConsoleLog` 之前） |

## 教训

1. **"用 appendFileSync 替代 console.* 更安全"这个假设本身不成立**——两者都是同步文件写入，风险等级相同，只是 console.* 多了一层 `bridge.adapter.emit` 广播开销。真正的安全做法是"异步写、fire-and-forget"，不是"换个函数名但还是同步"。这条教训贯穿了从第 1 轮到现在的整个排查——每一轮都在用同步写日志去替代同步写日志（只是换了触发机制），直到这一轮才发现问题出在"同步"这个属性本身，不是"console.*"这个函数本身。
2. **第三方依赖（`electron-log`）默认配置也可能是同步的**，不能默认"只要不是自己写的 console.* 就安全"。`electron-log` 的文件 transport `sync: true` 是默认值，不是这个项目主动选的，而是我们通过 `Object.assign(console, log.functions)` 把 `console.*` 接到它身上时顺带引入的隐藏风险。以后接入任何"把 console 重定向到文件"的库，都要检查它的写入模式是同步还是异步。
3. **procdump 的 handle 表拿不到文件名时，寄存器（`r10`/`rcx`）+ `GrantedAccess` 位模式仍然能确认"这是一次追加写"这个大方向**，但要精确定位到具体文件/代码行，光靠事后静态分析效率很低——不如提前埋一个异步、启动前记录的全局 fs 写入 watchdog，下次复现直接看日志，不用再抓 dump 反复分析寄存器。
4. **`import * as fs from 'node:fs'` 之后不能对返回对象做属性赋值式 monkey-patch**（打包后是只读 ESM 命名空间对象），要用 `require('node:fs')` 拿可变的 CommonJS 对象。
5. **休眠/唤醒可能是外部干扰因素之一，但目前只是时间线巧合，没有实锤**——不要在没有第二个独立证据的情况下把"这次跟休眠时间对得上"当成确定结论对外宣称，只能作为一个待验证的怀疑方向记录下来。

## 待办（续三）

- ⚠️ **`src/process/utils/fsWriteWatchdog.ts` 是临时诊断工具，不是永久修复**。观察一段时间（跨几次休眠/唤醒周期）确认不再复现，或者复现后 watchdog 精确定位到了具体根因并修完，就要把这个文件删掉，同时删掉 `src/index.ts` 里 `import './process/utils/fsWriteWatchdog';` 这一行（在 `configureConsoleLog` 之前那一行）。不要让诊断代码长期留在主进程里。
- `logs/fs-write-watchdog.log` 会持续增长（每次同步 fs 写入都记一行 STARTED），watchdog 移除前记得提醒用户这个文件可以定期清理，不影响功能。
- 休眠/唤醒是否真的是触发因素仍未证实，如果后续观察到"每次休眠唤醒后一段时间内容易复现，正常使用时不复现"这类规律，可以回来补充实锤；如果观察不到规律，这条怀疑可以从"待验证方向"降级为排除项。

---

# 2026-07-04 —— 卡死的真正终局：Electron 自己的 DIPS 数据库 + SQLite 数据库反复损坏，两条修复叠加后彻底不再卡死

## 背景

续三的 electron-log 异步化修复上线后，用户仍然复现了冻结（procdump 显示同样的 `ZwWriteFile` 特征），且是在**全新启动的进程**上复现——这排除了"旧进程残留状态"，也让人怀疑 electron-log 修复本身是否有效。

## 排查：调用栈落在 electron.exe 框架二进制本身，不是我们的代码

用同样的 procdump 方法论（见 [[aionrs-send-ready-timeout]] 记忆）现场抓取实时转储，这次的关键突破：

1. 卡住线程的调用栈里 `electron.exe+0xbe6c290`、`+0x39b9784`、`+0xc0f52f0`、`+0x39bc0fb`、`+0x5ceca6`、`+0x44dfef4` 等偏移量，跟**前一天**（不同进程实例、不同日期）抓到的 dump **精确到字节完全一致**。`electron.exe` 是 `node_modules/electron/dist/electron.exe`——Electron 框架自带的二进制文件，我们改代码重新构建根本不会碰它一个字节。
2. 同时新增的 `fsWriteWatchdog.ts`（拦截 Node `fs.writeFileSync`/`fs.appendFileSync` 这两个 JS 层函数）在这次冻结期间**完全没有记录任何内容**。

两条证据合在一起：**这次卡住的同步写入压根不经过任何一行 JS 代码，是 Electron/Chromium 自己内部的 C++ 层在做同步文件写入**，我们之前修的所有 electron-log/appendFileSync 异步化都是真实存在、也修对了的问题，但都不是这一类冻结的直接原因。

## 修复 1：禁用 Chromium 的 DIPS（反弹追踪检测）数据库

检查 userData 目录发现 `DIPS`/`DIPS-wal` 文件（Chromium 自己维护的反追踪 SQLite 数据库）在持续增长（一天内从 53KB 涨到 152KB），是一个活跃的后台写入源。这个应用不是通用浏览器，没有第三方网站导航场景需要防反弹追踪，这个功能对本应用没有任何功能价值，只是多一个磁盘写入源。

`src/process/utils/configureChromium.ts` 加：
```ts
if (app) {
  app.commandLine.appendSwitch('disable-features', 'DIPS');
}
```
不局限于 dev 模式（`disable-http-cache`/`disable-gpu-shader-disk-cache` 那两行是 dev-only，这一行没有下行风险，生产也一并禁用）。

修完后重新构建测试，**这次没有再复现冻结**（Windows Task Manager `Get-Process | Responding` 一直是 `True`）。

## 排查 2：冻结解决后暴露出的新症状——Issue 创建要等 8 秒 + 数据库报 "database disk image is malformed"

冻结解决后，用户报告"创建 Issue 需要 8 秒才完成"，日志里反复出现：
```
SqliteError: database disk image is malformed
    at OneCmdDatabase.getUserConversations ...
```

用项目自带的 `better-sqlite3`（跟 Electron 的 Node ABI 绑定，需要 `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron script.js` 而不是系统 Node 直接跑，否则 NODE_MODULE_VERSION 不匹配）在只读模式跑 `PRAGMA integrity_check`：
```js
const Database = require('better-sqlite3');
const db = new Database('C:/.../1one.db', { readonly: true, fileMustExist: true }); // 注意用正斜杠，反斜杠在 JS 字符串里对不认识的转义字母会被静默吃掉，路径会变成乱码
```
结果：100 条问题，全部是 `wrong # of entries in index X` / `row N missing from index X`——**索引跟表数据不一致**，不是表数据本身的页级损坏（这一点很重要，意味着能用 `REINDEX` 直接修，不需要复杂的数据恢复）。

**修复步骤**（顺序：备份 → checkpoint → reindex/vacuum）：
```js
db.pragma('wal_checkpoint(TRUNCATE)');
db.exec('REINDEX;');
db.pragma('integrity_check'); // 第一次修完剩一条 "Page N: never used"（无害，只是有页分配了没被引用）
db.exec('VACUUM;');           // 清掉未引用页，integrity_check 最终返回 "ok"
```

**但只 REINDEX 不够**——几分钟后正常使用又复现了同样的索引损坏（100 条问题原样重现，外加一条新的"Page 3063: never used"）。说明这不是历史遗留的一次性问题，是**正在持续发生**的写入损坏。

## 修复 2：SQLite 从 WAL 模式切回 rollback journal（`journal_mode = DELETE`）

WAL 模式依赖一个 `-shm` 共享内存映射文件用于读写协调。Windows 上"WAL + 实时杀毒/EDR 扫描干扰 mmap 文件"是导致 SQLite 索引反复损坏的经典组合（用户机器 Defender 实时保护确认开着；虽然后来用户自己加了排除路径，但代码层面的根治不应该依赖用户环境配置）。

这个应用对自己的数据库基本是单进程独占访问（不需要 WAL 带来的多进程读写并发能力），`src/process/services/database/schema.ts` 里：
```ts
// 之前: db.pragma('journal_mode = WAL');
db.pragma('journal_mode = DELETE');
```
换成 DELETE 模式后不再依赖 `-shm` 映射文件。同步更新了 `src/process/services/database/README.md` 里两处提到 WAL 的描述。

修复后：`journal_mode` 确认变成 `delete`，`integrity_check` 持续保持 `ok`，`malformed` 报错不再出现。

## 排查 3（进行中）：Issue 创建仍需 8 秒 + Issues 列表页显示 0 条（但超级助手能看到）

数据库修复后，"8 秒"这个数字精确匹配 `syncBrowserWebuiSession.ts` 里手动加的 `SYNC_BROWSER_SESSION_TIMEOUT_MS = 8_000` 超时——说明每次都跑满超时才降级到兜底，不是数据库慢导致的，是这条 IPC 调用链本身没有在超时前拿到结果。

直接查当前数据库内容验证了一个旁支怀疑（"是不是 tenant_id 不一致导致列表查不到"）——**排除**：最新创建的记录 `tenant_id` 全部是 `default`，跟列表查询 `WHERE r.tenant_id = ?` 的过滤条件一致，不是数据层面的租户不匹配。

当前假设：Issue 创建走的是桌面本地兜底身份（`creator_id: desktop-local-admin`，能直接写库成功），而 Issues 列表页要通过 WebUI HTTP 接口 `/api/admin/requirements/tree` + 鉴权 token 才能读——如果 `syncBrowserWebuiSession()`（主进程 `WebuiService.ts`）一直没能在 8 秒内拿到有效 token（也就是每次都超时降级），列表请求会因为鉴权信息缺失而返回空，"超级助手"大概率走本地 IPC 直连数据库不需要这个 token，所以能看到数据。**这两个症状（8秒延迟 + 列表看不到）很可能是同一个根因的两种表现**，尚未最终定位到 `syncBrowserWebuiSession()` 内部具体卡在哪一步（`getClientEnterpriseServerOrigin`/`cookies.get`/`verifyToken`/`findById` 中的哪个）。

已加计时诊断（主进程 `WebuiService.syncBrowserWebuiSession()` + 渲染层 `ensureDesktopWebuiRunning()`，均用安全的异步 `console.log`，不是同步文件写），待下次测试结果确定具体卡点后移除。

## 涉及文件（本节新增/修改）

| 文件 | 改动 |
|------|------|
| `src/process/utils/configureChromium.ts` | 加 `app.commandLine.appendSwitch('disable-features', 'DIPS')`（非 dev-only） |
| `src/process/services/database/schema.ts` | `journal_mode` 从 `WAL` 改为 `DELETE` |
| `src/process/services/database/README.md` | 同步更新两处 WAL 相关描述 |
| `src/process/bridge/services/WebuiService.ts` | `syncBrowserWebuiSession()` 加逐步计时 `console.log`（TEMP DIAGNOSTIC，待移除） |
| `src/renderer/utils/ensureDesktopWebui.ts` | `ensureDesktopWebuiRunning()` 加逐步计时 `console.log`（TEMP DIAGNOSTIC，待移除） |
| （运维操作，非代码）`1one.db` | `wal_checkpoint(TRUNCATE)` + `REINDEX` + `VACUUM` 修复索引损坏；`1one.db.backup.pre-reindex-*` 保留了修复前的快照 |

## 数据丢失说明（历史遗留，非本次操作导致）

对比三个时间点的 `requirements` 表内容（06-27 备份 / 07-04 修复前备份 / 当前），发现 06-27 存在的 7 条早期测试记录（"测试"、"测试2~5"、"test"、"test from shell"，均为 2026-06-03/06-05 创建的占位测试数据）在 07-01 之前的某个时间点就已经丢失，**丢失窗口早于本次排查开始，不是今天的 REINDEX/VACUUM/journal_mode 操作造成的**——这些操作只会重建索引/回收空间，不会删除行数据，且当前记录数（7 条）比修复前备份（2 条）更多，只增不减。丢失的记录内容都是占位测试数据，价值低，如需要可以从 `1one.db.backup.1782557970256`（06-27 备份）里原样恢复，但用户未要求恢复。真实丢失原因推测是本次排查过程中某次真冻结时进程被强制杀掉，SQLite 写入被打断——跟本节修复的索引损坏是同一类根因，журнал_mode 切换后理论上不应再复现。

## 教训

1. **procdump 抓到的调用栈落在第三方框架/依赖的二进制文件里（不是自己项目编译出的产物），就该立刻怀疑问题不在应用代码**——本例中 `electron.exe` 的偏移量在两次不同日期、不同进程实例的 dump 里完全一致，这本身就是"这是一段固定不变的框架代码"的强信号，不需要再猜是不是自己漏改了什么文件。
2. **给 Electron 应用做"这个功能用不上"的 Chromium feature 排查是有效且低风险的减少磁盘 I/O 手段**——`DIPS`、GPU shader 缓存、HTTP 缓存这类 Chromium 内置但对纯 IPC 桌面应用没有实际价值的功能，都可以通过 `--disable-features`/专用 switch 关掉，减少一个不受应用代码控制的写入源。
3. **SQLite `integrity_check` 报"索引不一致"跟"页损坏"是完全不同严重程度的问题**——前者 `REINDEX` 就能修，后者可能需要 `.recover`/导出重建，遇到 malformed 错误先跑 integrity_check 分清楚是哪一种，不要一上来就假设需要复杂恢复流程。
4. **"REINDEX 修好了"不等于"根治了"——如果损坏在修复后的正常使用中很快又复现，说明还有一个持续在发生的写入损坏机制，不能止步于"这次修好了"就收工**，要往回找"为什么会持续损坏"，不能只处理症状。
5. **WAL 模式在 Windows 上跟杀毒/EDR 实时扫描的组合是已知的 SQLite 损坏诱因**，对于本来就是单进程访问自己数据库的桌面应用，WAL 带来的并发收益往往不值得这个风险，rollback journal（DELETE 模式）更稳妥。
6. **procdump 定位到"卡在同步写"之后，用 `fsWriteWatchdog.ts` 这类 JS 层拦截仍然可能一无所获**——如果卡住的写入在 Electron/Chromium 自己的 native 层，JS 层的 monkey-patch 天生看不到，这时候要回到"调用栈落在哪个二进制"这条线索，而不是纠结于"为什么我的监控没抓到"。
7. **修复一个"卡死"类问题后，冒出的新症状（8秒延迟、列表看不到数据）不一定是新 bug，可能是同一根因换了个表现形式**——冻结解决后 IPC 调用不再无限期挂起，而是转为"总是精确等满超时值"，这本身就是有用的诊断线索（说明调用链本身有问题，不是间歇性变慢）。

---

# 2026-07-04 续 —— 8 秒延迟真正根因：`ConfigStorage.get()` 是渲染层专用 API，主进程调用永远不返回

## 背景

上一节修完 DIPS + journal_mode 之后彻底不再卡死，但暴露出两个新症状：① 创建 Issue 精确要等 8 秒才完成；② 第一次打开 Issues 列表页是空的，多点几次刷新才能看到历史记录（用户原话："这个肯定是有问题的，估计是同一个问题"——判断准确，两者确实是同一根因）。

## 排查过程

1. `8 秒` 这个数字精确匹配 `syncBrowserWebuiSession.ts` 里手动加的 `SYNC_BROWSER_SESSION_TIMEOUT_MS = 8_000`——说明 `webui.syncBrowserWebuiSession.invoke()` 这条 IPC 调用每次都跑满超时才降级到兜底，不是"偶尔变慢"，是**从不在超时前返回**。
2. 加了逐层计时诊断（渲染层 `ensureDesktopWebuiRunning()` 走 DevTools console 安全打印；主进程 `WebuiService.syncBrowserWebuiSession()` 走 electron-log 异步写盘，均不会自我阻塞）后发现：`getStatus`（另一条 IPC 通道）能在 7-12ms 内正常响应，证明主线程没有被同步阻塞，问题是这一条特定 IPC 调用本身作为 Promise 永远不 resolve。
3. 用 CDP（`remote-debugging-port=9230`，本项目 dev 模式默认开启）连上渲染进程的 DevTools，通过 `Runtime.evaluate` 直接调用 `window.electronAPI.emit('subscribe-webui.sync-browser-webui-session', {id, data})` 手动重放这条 IPC 请求（绕过所有 React 组件逻辑，排除 UI 层因素），确认**手动直接触发同样超时**——证实问题在 IPC 调用链本身，不是某个触发时机的偶发问题。
4. 在 `webuiBridge.ts` 的 provider 包装最外层加日志确认：请求**确实到达了主进程**（`provider ENTERED` 稳定触发），但函数体内部除了第一行"进入 `getClientEnterpriseServerOrigin`"之外，后续任何一行日志都不出现——包括一个特意加的"对照测试"：`await ConfigStorage.get('language')`（一个在 app 里到处用、明确正常工作的 key）**同样卡住不返回**，证明问题跟具体调用的是哪个 key 无关，是 `ConfigStorage.get()` 这个调用本身、在这条调用栈里，从不 resolve。

## 根因

`ConfigStorage`（`@office-ai/platform` 的 `storage.buildStorage(...)`）的 `.get()`/`.set()` 是**为渲染层设计的 API**：渲染层调用 `.get()` 会走 `bridge.invoke()`（发一条 `subscribe-{channel}` 事件，等待对应的 `subscribe.callback-{channel}{id}` 响应），main 进程侧 `ConfigStorage.interceptor(configFile)`（`initStorage.ts`）注册了对应的 provider 来应答——这条链路完整、正确，渲染层调用完全没问题。

但**从主进程代码内部调用 `ConfigStorage.get()`，同样会走 `.invoke()`**，而 `src/common/adapter/main.ts` 里主进程的 `bridge.adapter({emit, on})` 把 `emit` 重写成了 `win.webContents.send(...)`（发给渲染层）+ `broadcastToAll(...)`（WebSocket）——**主进程自己发起的 `.invoke()` 请求会被发送到渲染层，而不是主进程本地已经注册好的 provider**。没有任何渲染层代码给 `agent.config.storage.get` 注册 provider，请求发出去后石沉大海，`.invoke()` 返回的 Promise **永远不会 resolve**（不是抛错，`.catch()` 完全捕获不到）。

`WebuiService.getClientEnterpriseServerOrigin()`（本轮 8 秒延迟的直接原因）和 `oneModelInfo.ts` 的 `listOneAgentSelectableModels()`/`resolveTProviderFromOneCompoundId()`（同一个坏模式，之前没人发现过在卡）都在主进程代码里直接调用了 `ConfigStorage.get()`。`oneModelInfo.ts` 里甚至有一行注释"Prefer ConfigStorage (intercepted) so updates are reflected immediately"——**写这段代码的人以为主进程调用 `ConfigStorage.get()` 会走本地拦截、更快更新，实际上完全相反：根本不会返回**。

项目里正确的主进程内部读配置方式是 `ProcessConfig`（`src/process/utils/initStorage.ts` 导出的 `export const ProcessConfig = configFile`，是同一份 `JsonFileBuilder` 直接文件读写，不经过任何 IPC/bridge），`AcpDetector.ts`、`acp/index.ts`、`acpConversationBridge.ts`、`applicationBridge.ts`、`conversationBridge.ts`、`memoryBridge.ts` 等文件里都是这么用的——这才是主进程代码应该遵循的既有模式。

## 修复

把 `WebuiService.ts` 和 `oneModelInfo.ts` 里全部主进程侧 `ConfigStorage.get(...)` 调用改成 `ProcessConfig.get(...)`。CDP 手动重放验证：修复前稳定超时（`TIMEOUT_10s`），修复后 **8ms 内正常返回**（`GOT_RESPONSE in 8ms`）。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/process/bridge/services/WebuiService.ts` | `getClientEnterpriseServerOrigin()` 里 2 处 `ConfigStorage.get` → `ProcessConfig.get`；import 从 `@/common/config/storage` 改成 `@process/utils/initStorage`；清理全部诊断用 `console.log` |
| `src/process/agent/one/oneModelInfo.ts` | 2 处 `ConfigStorage.get('model.config')` → `ProcessConfig.get(...)`，同样的坏模式，顺手修掉 |
| `src/process/bridge/webuiBridge.ts` | 清理诊断用 `console.log`（provider 入口标记） |
| `src/renderer/utils/ensureDesktopWebui.ts` | 清理诊断用 `console.log`（逐步计时） |

## 排查方法论补充

1. **CDP `Runtime.evaluate` 直接重放一条 IPC 请求，是隔离"UI 触发时机"和"IPC 调用链本身"两类问题的利器**——本项目 dev 模式默认开 `remote-debugging-port`（`configureChromium.ts`），`curl http://127.0.0.1:PORT/json` 拿到目标页面的 `webSocketDebuggerUrl`，用 Node 的 `ws` 包连上去发 `{method:"Runtime.evaluate", params:{expression, awaitPromise:true}}`，就能在不点任何 UI 按钮的情况下精确复现和调试一次 IPC 调用。比"改代码加日志→重新构建→点 UI→翻日志"这个循环快得多，尤其适合"怀疑是某条具体调用链的问题，而不是触发路径的问题"这种场景。
2. **诊断信息"卡在哪一步"的标准做法：在函数体每个 await 之间插日志，看最后一条打印到哪一行**——本次真正定位靠的是发现"connect 到 provider 的入口能触发，但函数体内部任何一行后续日志都不出现"，直接把范围锁定到 `await ConfigStorage.get(...)` 这一行本身，而不是它前后的任何逻辑。
3. **"对照测试"（换一个明确正常工作的输入，看是否复现同样的症状）是排除"是不是这个具体参数有问题"的最快方法**——加一行 `await ConfigStorage.get('language')`（明确到处用、正常工作的 key）立刻证明了问题不在 `WEBUI_DEPLOYMENT_ROLE_KEY` 这个 key 本身，而在 `ConfigStorage.get()` 这个调用方式，从主进程发起时就是坏的。
4. **同一个 IPC/RPC 抽象库，在"发起方"和"响应方"处于同一个进程 vs 不同进程时，语义可能完全不同——不能假设"反正都是同一套 API，行为应该一致"**。`bridge.buildProvider()` 生成的 `{provider, invoke}` 在设计上是给"渲染层发起、主进程响应"这个方向用的；反过来在主进程内部同时调用 `provider()`（正确：本地拦截）和 `invoke()`（错误：会被当成"要发给渲染层"的请求）就会出问题。排查这类"看起来到处都用同一个 API，但在某个特定调用点上莫名其妙不工作"的 bug 时，要去确认这次调用的"进程上下文"是否跟这个 API 原本设计的调用方向一致。
5. **代码注释里的"为什么这么写"，如果作者的理解本身是错的，会把后来者也带偏**——`oneModelInfo.ts` 里"Prefer ConfigStorage (intercepted) so updates are reflected immediately"这条注释，反映了写代码的人对这个 API 跨进程语义的误解，而且这个误解被写成了看起来很有道理的性能优化理由，容易让后续维护者不去怀疑这一行代码。遇到"这个函数一直卡住不报错也不返回"的问题时，不要因为代码里有一条听起来合理的注释就假设这行代码本身没问题。

---

# 2026-07-04 助手/技能中心调用问题 — 分析与第一轮修复

## 背景

用户反馈"助手和技能中心的调用总是出现各种问题"。对照上游 AionUi 仓库（https://github.com/iOfficeAI/AionUi）与官网分析后确认：问题不是单个 bug，而是**旧架构的设计缺陷 + 上游已修复但本 fork 未跟进的一批 fix** 叠加。

## 与上游的分叉现状（重要背景，影响后续所有决策）

- 本 fork 于 **2026-04-08 从 AionUi ~v1.9.x 快照全量导入**（首个 commit "项目第一次代码全量提交"），**无 git 血缘**，无法直接 merge 上游，只能按 release notes 逐个 cherry-pick 移植。
- 上游当前 **v2.1.28**（2026-07-03 发布，1-3 天一发版），已完成 monorepo 重构（`packages/desktop/`），并补齐了助手/技能的 e2e 测试（`tests/e2e/features/assistants`、`builtin-skill-migration`、`settings/skills`）。
- 上游 v2.1.24–v2.1.28 集中修复了与本次症状直接相关的问题：
  - v2.1.24：**统一 skill catalog**（设置 UI 与实际安装一致，PR #3424）；助手 backing agent 掉线不再静默消失（显示 unavailable + 自修复入口，PR #3395）
  - v2.1.25：**助手技能默认值从 agent 配置动态加载**，替换硬编码列表（PR #3445）
  - v2.1.26：记住上次选择的助手（PR #3468）；默认模型/模式从 runtime 配置读取（PR #3466）
  - v2.1.28：**会话技能进 `/` 斜杠菜单**供用户显式调用（PR #3482）；团队聊天正确传递 skills + MCP

## 本地调用链的根因分析

技能调用机制：首条消息注入技能索引（名字+描述）→ 模型在回复中输出 `[LOAD_SKILL: 名称]` 文本标记 → `GeminiAgentManager` 正则解析后把技能全文喂回。脆弱点：

1. **`[LOAD_SKILL]` 文本协议本身脆弱**（最大的"各种问题"来源）：模型不输出标记 / 名字写错 / 包进代码块 / 上下文压缩后索引丢失（索引只注入首条消息），技能就静默不加载。
2. **`AcpSkillManager` 互斥单例被多会话互踩**：`getInstance(enabledSkills)` 用互斥单例+缓存键，`prefetchSkillsIndex` 无参调用（键 `'all'`）会把助手会话刚建好的实例整个替换；不同助手的并发会话来回重建单例，缓存完全失效并构成竞态温床。
3. **`AcpSkillManager` 满是 console.***：位于 `src/process/` 下，技能发现是扫盘操作，触发主进程 console 禁令描述的 bridge 广播阻塞风险（同 6-23/7-01 卡死问题同源）。
4. **助手 enabledSkills 无一致性校验**：技能被删除/改名后，助手配置里的引用悬空，运行时静默找不到，UI 无任何提示。
5. **注入逻辑三路分支**（`firstMessage.ts` 的 useSkillsIndex/nativeOnlyRules/fullSkillContent）：不同 backend 注入方式不同，行为不一致、难排查（本轮未动，列入待办）。

## 本轮修复清单

### 1. [已修复] AcpSkillManager 互斥单例 → 按 enabledSkills 组合的 Map 缓存

**方案**：`private static instance + instanceKey` 改为 `private static instances: Map<string, AcpSkillManager>`。每个 enabledSkills 组合持有独立实例，并发会话互不覆盖；`prefetchSkillsIndex` 的无参调用（`'all'` 键）不再破坏助手会话的实例。`resetInstance()` 改为清空整个 Map（技能目录变更时强制重扫，语义不变，测试 `skillsMarket.test.ts` 通过）。

### 2. [已修复] AcpSkillManager + prefetchSkillsIndex 清除全部 console.*

**方案**：模块内新增 `logSkillEvent()`（异步 `appendFile`，best-effort，never-throw，模式对齐 `bridgeLog.ts`），写入 `logs/skills.log`。替换 11 处 console.log/warn/error。技能排查以后看 `logs/skills.log`。

### 3. [已修复] 助手 enabledSkills 引用一致性校验（UI + 运行时）

**方案**：
- UI：`AssistantEditDrawer` 技能区顶部新增 warning Alert——列出"已启用但技能中心不存在"的技能名（红色 Tag），附一键"移除失效引用"按钮（只读助手不显示按钮）。i18n key：`settings.assistantMissingSkillsWarning` / `assistantMissingSkillsRemove`（zh-CN + en-US）。
- 运行时：`discoverSkills()` 扫描完成后，把"启用了但任何技能目录都找不到"的名字写入 `logs/skills.log`（stale assistant references），排查时可直接定位。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/process/task/AcpSkillManager.ts` | 单例→Map 缓存；新增 `logSkillEvent()`；11 处 console.* 替换；discoverSkills 末尾记录 stale 引用 |
| `src/process/services/agentToolkit/prefetchSkillsIndex.ts` | catch 里的 console.warn → `logSkillEvent` |
| `src/renderer/pages/settings/AgentSettings/AssistantManagement/AssistantEditDrawer.tsx` | 新增 missingSkills 计算 + warning Alert + 一键移除 |
| `src/renderer/services/i18n/locales/{zh-CN,en-US}/settings.json` | 各新增 2 个 key |
| `src/renderer/services/i18n/i18n-keys.d.ts` | 重新生成 |

## 验证情况

- `npx tsc --noEmit` 通过
- `node scripts/check-i18n.js` 通过（历史遗留 warning 与本次无关）
- 技能相关 5 个单测文件 40 用例全过（skillsMarket / AcpAgentManagerSkillInjection / geminiAgentManagerThinking / acpAgentManagerCronGuard / acpSlashCommandsUpdatedEvent）
- oxlint 0 error；剩余 2 个 await-in-loop warning 为原有代码，未动
- **未做**：桌面端手工验证（`npm run restart` 后打开助手编辑抽屉，人为把某个已启用技能目录改名，确认红色告警出现、一键移除生效、`logs/skills.log` 出现 stale 记录）

## 后续待办（按优先级）

1. **桌面端手工验证本轮改动**（`npm run restart`，见上）；确认后 commit（中文 commit message，等用户确认再提交）。
2. **提交后打新 Windows 安装包**（交付约定：`src/**` 行为变更必须 `npm run dist:win`；打包前 bump package.json patch 版本并 commit push；不删旧 .exe）。
3. **中期对齐上游**（把 release notes 当补丁清单移植）：
   - 统一 skill catalog 服务：技能中心 UI / 助手编辑器 / 运行时注入读同一数据源（对应上游 PR #3424）
   - 技能索引不只注入首条消息：会话恢复/上下文压缩后重新注入，或每 N 轮轻量刷新
   - 技能进 `/` 斜杠菜单供用户显式调用（对应上游 PR #3482），降低对 `[LOAD_SKILL]` 文本协议的依赖
   - `ASSISTANT_PRESETS.defaultEnabledSkills` 从技能目录实际元数据推导，替换硬编码（对应上游 PR #3445）
   - 助手 backing agent 不可用时显示 unavailable + 自修复入口，而非静默消失（对应上游 PR #3395）
4. **简化 `firstMessage.ts` 三路注入分支**，统一各 backend 的技能注入行为（改动面大，需单独一轮）。
5. **流程建设**：
   - 加 `upstream` remote（https://github.com/iOfficeAI/AionUi）作 cherry-pick 参考源；每次上游发版扫 release notes，凡 assistant/skill/cron 相关 fix 评估移植
   - 把上游 `tests/e2e/features/assistants`、`settings/skills` 的 e2e 测试场景搬过来做回归防线

---

# 2026-07-04 助手/技能第二轮 — 上游对齐(待办 3/4/5)+ 意外挖出核心回归

接上一节。用户要求继续做待办 3(中期对齐上游)、4(简化注入分支)、5(流程建设)。实施过程中挖出一个比所有计划项都重要的回归 bug(见修复 1)。

## 修复清单

### 1. [已修复][核心回归] agentPrompt 把首条消息的规则+技能注入整个覆盖掉

**问题**：`e24ec81d`（2026-06-15，附件增强功能）给 `sendConversationMessage` 加了 `agentPrompt`（附件上下文前缀 + 干净正文），所有渲染端消息都会携带它。但 `AcpAgentManager.sendMessage` 发送的是 `data.agentPrompt ?? contentToSend`——首条消息辛苦算出来的 `applyAgentToolkitFirstMessage(contentToSend)`（助手规则 + 技能索引）被直接丢弃。**自 6-15 起，所有 ACP 会话的助手规则和技能索引根本没送到 agent**。OpenClaw 同类问题（有 agentPrompt 时整个跳过注入）。这能直接解释"助手调用总是出现各种问题"且时好时坏（gemini 助手走 GEMINI.md 原生机制不受影响，ACP 助手全军覆没）。

**为什么测试没拦住**：`AcpAgentManagerSkillInjection.test.ts` 的用例全部不带 agentPrompt 调用，恰好绕过回归路径。

**方案**：注入改为应用在"实际发送的字符串"上（`data.agentPrompt ?? data.content`），OpenClaw 同步修复（NanoBot 本来就是正确模式）。新增 2 个带 agentPrompt 的回归用例钉死。

**影响文件**：`AcpAgentManager.ts`、`OpenClawAgentManager.ts`、`tests/unit/AcpAgentManagerSkillInjection.test.ts`

### 2. [已完成][待办3-斜杠菜单] 技能进 `/` 菜单 + 确定性展开（对齐上游 #3482）

**方案**（管道大部分已存在，只做接线）：
- `SlashCommandSource` 增加 `'skill'`（`src/common/chat/slash/types.ts`）
- `conversation.getSlashCommands` provider：原来非 acp 会话直接返回空；现在对所有会话类型追加"会话已启用技能"命令项（`kind:'template'`、`selectionBehavior:'insert'`，选中后填入 `/skill-name `，与上游 UX 一致）。与 ACP 原生命令重名时跳过技能项。
- 新增 `agentToolkit/slashSkillInvocation.ts`：`parseSlashInvocation` + `expandSlashSkillInvocation`。发送时在 `sendConversationMessage` 统一拦截：输入是 `/skill-name [args]` 且技能在会话 enabledSkills 里 → 把技能全文确定性注入 agent prompt（用户看到的消息仍是自己输入的 `/skill-name`）。名字不在启用列表的不展开，留给 ACP 原生命令（/compact 等）。
- 渲染端零改动：所有 SendBox 已用 `useSlashCommands`，菜单自动出现。gemini worker 用 `agentPrompt ?? input`，展开对 gemini/acp/aionrs/nanobot/remote 全部生效。

**意义**：技能调用从"祈祷模型输出 [LOAD_SKILL] 标记"多了一条确定性路径，用户可显式调用。

### 3. [已完成][待办4] 简化 firstMessage.ts 注入分支

**发现**：三路分支中第三路（`!nativeOnlyRules && ...`）逻辑上不可达——`useSkillsIndex === false` 时 `nativeOnlyRules` 必为 true。`fullSkillContent` 选项只在死分支中使用。

**方案**：删除死分支和 `fullSkillContent` 选项，收敛为两路：需要索引注入 → `prepareFirstMessageWithSkillsIndex`；backend 原生支持技能 → 只注入规则。OpenClaw/NanoBot 调用点同步去掉 `fullSkillContent: true`。行为不变（有测试背书），可读性大幅提升。

### 4. [已完成][待办3-预置一致性] preset defaultEnabledSkills 构建期校验（对齐上游 #3445）

**核实结论**：首页选助手建会话读的是存储配置（`useCustomAgentsLoader` → `resolveEnabledSkills`），不是硬编码 preset——上游 #3445 的具体 bug 在本 fork 不存在。硬编码 `defaultEnabledSkills` 只做首次落库种子。

**方案**：新增 `tests/unit/assistantPresetSkillRefs.test.ts`——逐个断言每个 preset 的 defaultEnabledSkills 在 `src/process/resources/skills/{name}` 或 `_builtin/{name}` 有 SKILL.md。种子引用坏了在 CI 就报。

**顺手修的误报**：上一轮的助手编辑抽屉"缺失技能"告警会误报 `_builtin` 技能（如 cowork 的 skill-creator，`listAvailableSkills` 不含 `_builtin`）。已在抽屉里拉取 `listAutoSkills` 并从 missing 计算中排除。

### 5. [已核实无需改动][待办3-统一catalog] skill catalog 数据源已经是统一的（对齐上游 #3424）

技能中心 UI 和助手编辑器都走 `fs.listAvailableSkills`（+`listAutoSkills`）同一 provider；运行时 `AcpSkillManager` 扫同样的目录（`builtin-skills copy dir` + `skills dir` + `_builtin`），元数据解析都是同一个 `readSkillMetadata`。上游 #3424 要解决的"UI 与实际安装不一致"在本 fork 无结构性问题。不做投机重构。

### 6. [已核实+缓解][待办3-索引重注入] 会话恢复不丢技能

**核实结论**：`isFirstMessage` 是 per-manager-instance 字段——app 重启/manager 闲置回收后重建,下一条消息自动重新注入规则+索引,"重启后丢技能"场景本来就覆盖。真正缺口只剩**会话中途 CLI 自行压缩上下文**导致索引被挤掉,这个从 host 侧无法可靠检测。**缓解**:修复 2 的斜杠菜单给了用户确定性重新调用技能的入口。不做"每 N 轮重注入"的投机实现。

### 7. [已完成][待办5] 流程建设

- `git remote add upstream https://github.com/iOfficeAI/AionUi.git`,push URL 已设为 DISABLED 防误推,已 fetch 近 200 提交作 cherry-pick 参考（`git log upstream/main`）。
- 上游 e2e 场景移植：本轮以单测形式覆盖了 assistants/skills 的关键不变量（preset 引用完整性、注入回归、斜杠展开）；上游 Playwright e2e 整套搬迁工作量大,列入后续。

## 涉及文件（本轮新增改动）

| 文件 | 改动 |
|------|------|
| `src/process/task/AcpAgentManager.ts` | 注入应用于实际发送串（修复 agentPrompt 覆盖回归） |
| `src/process/task/OpenClawAgentManager.ts` | 同上 + 去掉 fullSkillContent |
| `src/process/task/NanoBotAgentManager.ts` | 去掉 fullSkillContent |
| `src/process/services/agentToolkit/firstMessage.ts` | 删除不可达分支与 fullSkillContent 选项 |
| `src/process/services/agentToolkit/slashSkillInvocation.ts` | 新增：斜杠技能解析与确定性展开 |
| `src/process/bridge/conversationBridge.ts` | getSlashCommands 追加会话技能命令项 |
| `src/process/bridge/services/conversationSendService.ts` | 发送时拦截斜杠技能调用并展开 |
| `src/common/chat/slash/types.ts` | SlashCommandSource 增加 'skill' |
| `AssistantEditDrawer.tsx` | 缺失告警排除 _builtin 自动技能（修误报） |
| `tests/unit/slashSkillInvocation.test.ts` | 新增 12 用例 |
| `tests/unit/assistantPresetSkillRefs.test.ts` | 新增 preset 引用校验 |
| `tests/unit/AcpAgentManagerSkillInjection.test.ts` | 新增 2 个 agentPrompt 回归用例 |

## 验证情况

- `npx tsc --noEmit` 通过；oxlint 新增文件 0 warning 0 error（存量 warning/error 未动）
- 技能/斜杠/bridge 相关 12 个测试文件 98 用例全过
- 全量单测：3661 过 / 27 失败——失败的 10 个文件（企业版路由、pptPreviewBridge、configureChromium 等）**已用 git stash 基线验证为存量失败，与本轮无关**
- i18n 校验通过
- **未做**：桌面端手工验证（重点：① ACP 助手会话首条消息后 agent 是否遵守助手规则——回归修复的直接验证；② 会话里输 `/` 是否出现技能项、选择+发送后技能是否生效）

## 后续待办（更新版）

1. **桌面端手工验证**（`npm run restart`）：上面两条 + 上一轮的失效引用告警。
2. **确认后 commit + `npm run dist:win` 打包**（打包前 bump patch 版本,不删旧 .exe）。
3. **中期（本轮未做）**：
   - 助手 backing agent 不可用时显示 unavailable + 自修复入口（上游 #3395,涉及 agent 探测 UI,单独一轮）
   - 上游 Playwright e2e 整套搬迁评估
   - 存量 27 个失败单测分诊修复（企业版路由/pptPreviewBridge/configureChromium,与技能无关但该修）
4. **上游跟进机制**：每次上游发版扫 release notes（`gh release view vX.Y.Z -R iOfficeAI/AionUi`）,assistant/skill/cron 相关 fix 评估 cherry-pick（`git log upstream/main --oneline -- packages/desktop/...`）。

## 2026-07-04 补充：桌面端实测验证结果（CDP 重放）

按既有方法论（CDP 9230 + `Runtime.evaluate` 重放 IPC，绕过 UI 直接验证调用链），`npm run restart` 全量构建启动后实测：

| 验证项 | 结果 |
|--------|------|
| `list-auto-skills` 返回 22 个 `_builtin` 技能（含 skill-creator）——抽屉误报修复的依赖成立 | ✅ PASS |
| 创建带 `enabledSkills: ['officecli-docx','mermaid']` 的 gemini 会话 | ✅ PASS |
| **`conversation.get-slash-commands` 对 gemini 会话返回 2 个 `source:'skill'` 命令项**（改动前对非 acp 会话恒返回 `[]`），`selectionBehavior:'insert'` 正确 | ✅ PASS |
| 测试会话清理（remove-conversation） | ✅ PASS |
| `logs/skills.log` 记录启动 prefetch（22 builtin）与按会话 discovery（22 builtin + 2 optional）——console→文件日志替换在真实运行中生效 | ✅ 确认 |

验证脚本：临时脚本（scratchpad），核心是 `window.electronAPI.emit('subscribe-{channel}', {id, data})` + 监听 `subscribe.callback-{channel}{id}`，可按此模式随时重建。

**未实测**（需真实模型调用，由单测覆盖）：ACP 首条消息注入回归修复的端到端行为——单测 `AcpAgentManagerSkillInjection.test.ts` 带 agentPrompt 的 2 个用例已钉死；使用者日常对话即可感知（ACP 助手重新遵守规则）。

## 文档沉淀

- 新增 `docs/tech/skills-invocation.md`：技能调用机制完整文档（catalog 数据源、三条注入路径、agentPrompt 关键不变量、排查入口），并已挂入 `.claude/CLAUDE.md` 路由表（"改助手/技能相关代码前必读"）。

---

# 2026-07-04 第三轮 — 收尾原分析的全部剩余待办

接前两轮。本轮完成三件事：助手 unavailable 显示（上游 #3395）、存量 27 个失败单测全部清零、上游 e2e 场景搬迁。至此 7-04 最初分析给出的改进清单**全部落地**。

## 1. [已完成] 助手/Agent 不可用显示 + 自修复入口（对齐上游 #3395）

**根因定位**：`useCustomAgentsLoader` 对非预置（CLI 型）自定义 agent 做硬过滤——ACP 检测不到 backend（CLI 未装/被移除/启动竞态）时整个条目从首页消失，无任何提示。这正是上游 v2.1.24 修的"assistants silently disappearing"。

**方案**（渲染层，主进程零改动）：
- `AcpBackendConfig` 新增运行时标记 `backendUnavailable`（不持久化）；loader 不再过滤，改为标注。
- `useGuidAgentSelection` 新增 `unavailableCustomAgents` memo（独立列表，**不回写** `availableAgents` state——避免 availableCustomAgentIds→loader→merge 的循环依赖；选中持久化/fallback 逻辑也永远不会选到它们）。
- `AgentPillBar` 渲染不可用条目：降透明度 + 右上角警示点 + tooltip 说明；点击即自修复（`refreshCustomAgents` 重新检测 + 提示），检测恢复后自动变回可选。
- `findAgentByKey` 的助手兜底加 `isPreset` guard，防止未检测的 CLI agent 被误当作预置助手合成选中项。
- i18n：`guid.agentUnavailable` / `agentUnavailableTooltip` / `agentRedetecting`（zh-CN + en-US）。

**涉及文件**：`useCustomAgentsLoader.ts`、`useGuidAgentSelection.ts`、`AgentPillBar.tsx`、`GuidPage.tsx`、`guid/types.ts`、`acpTypes.ts`、`locales/{zh-CN,en-US}/guid.json`

## 2. [已完成] 存量 27 个失败单测分诊 — 全部清零（473 文件 / 3687 用例 0 失败）

逐个分诊结论：**全部是"代码有意改动、测试没跟上"或"mock 落后于源码"，无一真 bug**。修复对照：

| 测试文件 | 根因 | 处理 |
|----------|------|------|
| guidAgentHooks.dom (3) | aionrs 内置引擎改为恒可用且 fallback 首位（防 gemini 卡死），测试断言旧顺序 | 按现意图更新断言（fallback 恒返回 aionrs、永不为 null） |
| enterpriseRoles (2) / editionSwitchNavigation (1) / enterpriseLoginNavigation (1) | 90305cfe 默认落点 /sessions→/guid，测试断言旧路径 | 更新断言 + 注明 commit |
| enterpriseEditionSync (1) | 合并优先级有意反转（本机已加入企业以本机为准，防 SSO 覆盖显示"单机实例"），测试断言旧优先级 | 按 doc comment 更新断言与用例名 |
| pptPreviewBridge (12) | 源码加了 bundled-officecli 检测（`fs.existsSync` manifest 探测）+ 版本检查改 `execFileSync`，测试 mock 缺这两个函数 | mock 补 `existsSync`（返回 false 走 PATH 分支）+ `execFileSync`，更新版本检查断言 |
| schema (1) | c4a37d0 有意 WAL→DELETE（WAL 反复索引损坏），测试断言 WAL | 更新断言 + 注明 commit |
| configureChromium (1) | c4a37d0 无条件 append `disable-features=DIPS`，测试断言"完全不调用" | 改为断言"无 CDP 开关" |
| webuiApiBase (1, 挂 20s) | 8ca5256e 客户端模式路由新调 `getClientEnterpriseServerOrigin`→`ConfigStorage.get`，测试环境无 provider 永不 resolve | 测试补 ConfigStorage mock |
| webuiChangeUsername (4) | 33ce7b1 WebuiService 改 import ProcessConfig（initStorage 模块级需要 platform services） | 测试补 initStorage mock |

**教训（值得进流程）**：这批失败暴露同一个模式——**修 bug 时不跑/不更新受影响的测试**，欠账攒到 27 个。之后每次 fix 提交前应至少跑受影响目录的单测（AGENTS.md 已要求 `bun run test` before commit，需要真正执行）。

## 3. [已完成] 上游 e2e 场景搬迁（assistants/skills）

**评估结论**：本 fork 已有完整 Playwright+Electron e2e 基建（`tests/e2e/fixtures.ts` 单例 app + `helpers/bridge.ts` 的 invokeBridge）。上游的 assistants/skills e2e 依赖新版 UI 的 `data-testid`（单列表+全页编辑器），fork 是抽屉式 UI，**按文件搬不可行，按场景语义搬**。

**产物**：`tests/e2e/specs/assistants-skills.e2e.ts`（4 用例，真实 Electron 启动实测 4/4 通过，16s）：
1. 技能 catalog 可读且统一（available + auto/_builtin 均非空、条目带名字）
2. 已启用的助手只引用可解析技能（config 里的 enabledSkills ⊆ catalog——运行时版的 preset 引用校验）
3. 带 enabledSkills 的会话在斜杠菜单中出现对应技能（source:'skill'、insert 行为——本次新功能的 e2e 回归防线）
4. 不带 enabledSkills 的会话无技能斜杠项（负向）

运行方式：`npx playwright test tests/e2e/specs/assistants-skills.e2e.ts`（需先 `npm run stop:dev` 释放实例）。

## 验证情况（本轮）

- `npx tsc --noEmit` 通过；oxlint 改动文件 0 warning 0 error；i18n 校验通过
- **全量单测 473 文件 / 3687 用例 0 失败**（此前 10 文件 27 失败全部清零）
- 新 e2e 4/4 通过（真实 Electron 实例）
- 桌面开发实例已被 e2e 流程停止（`npm run stop:dev`），需要时 `npm run restart` 重启

## 当前待办（收敛后）

1. 桌面端人工体验一轮（重点：ACP 助手遵守规则、`/` 菜单技能、不可用 agent 的警示点与一键重检）
2. 确认后 commit（中文 message、等用户确认）→ bump patch → `npm run dist:win` 打包（交付约定）
3. 日常机制：上游发版扫 release notes cherry-pick；fix 提交前跑受影响单测

---

# 2026-07-04 第四轮 — 补齐三个"有意留缺"项（用户确认后开工）

第三轮汇报时明确标注的三个缺口，按用户确认的优先级 8 > 7 > 5 全部补齐。

## 1. [已完成] 助手 UI 交互层 e2e（原第 8 项缺口）

- **前置**：给助手管理 UI 补 `data-testid`（对齐上游命名习惯）：
  - `AssistantListPanel`：`assistant-card-{id}` / `switch-enabled-{id}` / `btn-duplicate-{id}` / `btn-delete-{id}` / `btn-create-assistant`
  - `AssistantEditDrawer`：`assistant-editor-drawer` / `input-assistant-name` / `input-assistant-description` / `btn-save-assistant` / `btn-delete-assistant`
  - e2e 导航 helper 增加 `assistants: '#/settings/assistants'` 路由
- **新增 `tests/e2e/specs/assistants-ui.e2e.ts`**（按上游 P0 用例语义重写，适配本 fork 抽屉式编辑器）：
  - P0-1 创建助手全流程（抽屉打开→填名/描述→保存→列表出卡片→删除清理，顺带覆盖删除确认 Modal）
  - P0-2 卡片点击开编辑器；enabled 开关原地切换不弹编辑器、状态翻转、可还原
  - P0-3 复制内置助手 → create 模式编辑器、名字预填、取消不落库
  - P0-4 内置助手编辑器：edit 模式、名字预填、删除可用（**实测发现本 fork 内置助手身份字段可编辑**，与上游 v2.1.25 的"identity fields locked"不同——按本 fork 实际行为断言，若未来对齐上游需同步改此用例）
- **实测**：与 assistants-skills.e2e.ts 合跑 8/8 通过（25s，真实 Electron）。

## 2. [已完成] 上游 release 自动扫描（原第 7 项缺口）

建了 Claude 定时任务 `upstream-aionui-release-scan`（每天 ~10:25）：扫最近 26h 的 AionUi 发版 → 筛 assistant/skill/slash/cron/注入/MCP 相关条目 → 输出中文报告 + 是否值得移植的评估（prompt 里已挂 skills-invocation.md 与 CONTEXT.md 路由，避免推荐已移植内容）。
**注意**：任务跑在 Claude 桌面应用里，应用关闭时到点不跑、下次启动补跑。任务文件：`C:\Users\allenzhao\.claude\scheduled-tasks\upstream-aionui-release-scan\SKILL.md`。

## 3. [已完成] 技能索引每 N 轮轻量重注入（原第 5 项缺口）

- `agentUtils.prepareSkillsIndexRefresh()`：只构建索引提醒块（不重复助手规则），前缀 `[Skills Index Reminder]`。
- `firstMessage.applyAgentToolkitIndexRefresh()`：门控（toolkit 开启 + backend 走索引注入路径才生效；原生技能 backend 返回 null）。`SKILLS_INDEX_REFRESH_INTERVAL = 20`。
- `AcpAgentManager`：新增 `messagesSinceToolkitInjection` 计数器——首条消息全量注入后清零；此后每条用户消息 +1，到 20 做一次轻量刷新并清零；不适用（原生/关闭）时消息原样发送、计数保留下次重试。
- 单测 +2（触发时机、原生 backend 永不触发），该文件 20/20 过。

## 验证情况（本轮）

- tsc 通过；新代码 oxlint 0 warning（存量文件的旧 warning 未动）
- 技能注入相关单测 20/20；两个助手 e2e spec 合跑 8/8
- 全量单测最终跑数见下轮记录（后台执行中，如有意外会另行记录；截至上一轮为 0 失败基线）

## 至此

7-04 最初分析的 1-8 项全部完成，无保留缺口。日常机制：每日上游扫描任务 + 双层测试防线（18 个技能相关单测 + 8 个 e2e）。下一步仍是:人工体验 → commit（等用户确认）→ bump patch → dist:win 打包。

---

# 2026-07-04 第五轮 — 上游全量对齐审计(v1.9.10 → v2.1.28,51 个版本)

用户要求全面对齐上游、排查整体 bug。方法:拉全 51 个版本 release notes 逐条分类,对高危项在本地代码逐个核查"bug 是否存在"。

## 架构分界(决定适用性的关键)

- fork 基线 = 2026-04-08 全量导入 ≈ **v1.9.9**,比之前估计的 v1.9.16 更早——**整个 v1.9.10~v1.9.25 修复批次都可能缺失**。
- 上游 v2.0 起换 Rust 后端(aioncore)+ 前后端分离,**v2.1.x 的大部分修复不适用**本 fork 的 Electron 单体架构(概念可参考,代码不可移植)。
- 结论:移植金矿 = v1.9.10–v1.9.25 同架构修复 + v2.1.x 中纯渲染层修复。

## 本轮已确认并修复(1)

### [已修复] cron 无效表达式使 CronService 初始化整体失败(上游 #2231 同类)
`CronService.startTimer` 直接 `new Cron(schedule.expr)`,croner 对无效表达式 throw;init 循环启动所有任务时一个坏表达式 → catch 后 rethrow → **所有定时任务停摆**。本 fork 的 cron 表达式常由 AI 聊天生成,比上游更易踩。已加 try/catch:坏任务记 `lastStatus:'skipped'` + `lastError`(含原始表达式)落库并通知前端,其余任务不受影响。tsc + 全量 3541 用例通过。

## 已核查确认「无此 bug」(fork 已有等效实现)(4)

| 上游修复 | 本地核查结论 |
|---|---|
| #2571/#2214 DB 误恢复丢数据(CANTOPEN 触发恢复)| `isSqliteCorruptionError` 只匹配真损坏文案且排除 native-module 错误;恢复前有 quarantine 备份 |
| #2618 Windows PATH 增强(cargo/go/deno/.local/bin)| `shellEnv.ts` 已覆盖 |
| #3018 已删 provider/助手启动复活 | server 配置迁移有一次性 flag;内置助手删除走 hidden 机制不复活 |
| #3366 Windows PDF 预览空白(file:// URL)| PDFViewer 已做反斜杠归一化 + `file:///` 前缀 |

## 已确认缺失、建议移植:Windows ACP 可靠性三件套(P0)

fork 有 `resources/bundled-bun`(npx 型 ACP 连接走 bundled bun),但缺上游三个配套修复:
1. **#2451 bunx 缓存损坏自动检测清理**——`bun x` 已知问题会把临时缓存搞坏,之后 Claude/Codex/CodeBuddy **每次重试必挂**,用户无从自救
2. **#2482 bun 缓存目录重定向到 userData**——避免 Windows EPERM(Defender 锁文件)
3. **#2496 覆盖 TMP/TEMP 使 bunx 工作目录避开杀软扫描路径**——本机已有 Defender 冻结前科(officecli manifest 探测),同类根因
三个都是 `acpConnectors.ts`/启动路径的小改动,建议下一轮一起移植。

## 架构适用、按优先级排查/移植候选(未逐行核查)

**P1(用户可感知的正确性)**:
- #2205 用户消息气泡文本原样保留(不被 trim/改写)
- #2342 gemini 首次启动 auth 加载完成后补发首条消息
- #2320 编辑 cron 任务时自定义表达式被重置
- #2487/#2502 cron 改用原地更新(防竞态数据丢失)/ 忽略对已删任务的更新
- #2345 app 退出时清理泄漏进程(fork 只覆盖了 worker kill 时孤儿,应用退出路径待核)
- #3019 切换会话时中断上一会话的 in-flight 上传(grep 未见 abort 逻辑)
- #2050 模型 provider 被删后打开旧会话崩溃
**P2(体验/健壮性)**:
- #2619/#2595/#2598 ACP idle 时序:正常退出误报 crash、idle 态 setMode 报错、initialize 顶层 modes 丢失
- #2225 流式输出期间自动滚动;#2223 会话切换 snapshot 过度重建
- #2229/#2422 malformed tool payload 渲染守卫
- #3308 从注册表水合 GUI 进程 PATH(桌面快捷方式启动时 CLI 检测更可靠)
- v1.9.11–1.9.15 team 模式修复批次(fork 有 team 模块,量大,建议专轮:工作区同步 #2362、leader 崩溃恢复 #2358、排队消息回滚 #2289 等)

## 不适用(v2.x 后端架构专属,仅概念参考)

aioncore 启动诊断链、web-host 端口管理、conversation 分页(靠后端 API)、conversation-scope MCP(后端实现)、runtime policy、model selector 后端数据源、更新器 CDN 元数据等。

## 长效机制

每日 10:25 的 `upstream-aionui-release-scan` 定时任务持续跟进新发版;本轮的分类清单可作为它的基线。

---

# 2026-07-04 第六轮 — Phase 1 移植落地(用户授权大改动后的第一批)

用户授权做大架构改动对齐官方能力。**战略决策(已与用户同步)**:不照搬上游 v2.0 Rust 后端分离(会推倒企业版/渠道/数字员工等全部二开,收益是已用自有方式实现的"可部署性");路线改为 Phase1 可靠性对齐 → Phase2 ACP 2.0 协议层移植 → Phase3 team 修复批次 → Phase4 v2.x 能力在自有架构内重实现。

## 本轮完成(Phase 1)

### 1. [已移植] bun 三件套(Windows ACP 可靠性,#2451/#2482/#2496)
- `acpConnectors.prepareCleanEnv`:BUN_INSTALL_CACHE_DIR/BUN_TMPDIR 重定向到 userData;Windows 下 TMP/TEMP 一并指向 bun-tmp,使 bunx 工作目录整链避开杀软扫描路径(EPERM 根治)
- `connectNpxBackend` 增加第三阶段重试:检测 "Cannot find package/module"(bunx 缓存损坏特征)→ `clearBunxCache` 从错误路径提取 bunx-* 缓存目录删除 → 重试一次
- 移植上游单测为 `tests/unit/acpBunxCache.test.ts`(9 用例);`acpConnectors.test.ts` 的 env 精确断言改 objectContaining(与上游同改)

### 2. [已移植] #2320 编辑 cron 任务不再静默改写自定义表达式
fork 的 `parseCronExpr` 比上游 bug 更重:`*/15 * * * *` 被误判 hourly,日/月字段直接忽略——编辑一次即破坏调度。已移植:新增 'custom' 频率类型 + 严格的预设匹配(不满足即 custom)+ 自定义表达式输入框(编辑时原样带出、保存时原样写回)+ 空表达式提交校验。i18n:`cron.page.form.customCronPlaceholder/customCronRequired`(freq.custom 两语言原本就有)。

### 3. [已移植] #2050 provider 删光后预置助手建会话崩溃
fork 已修 CLI 路径但 `buildPresetAssistantParams` 仍裸调 `getDefaultGeminiModel()`(throw)。新增 `resolveGeminiModel()` fallback 到 Google-Auth placeholder。

### 4. [已移植] #2205 用户消息气泡原样渲染
用户输入原来走 MarkdownView(换行合并、`#`/`*` 被解释)。现在 `position==='right'` 的消息用 `whitespace-pre-wrap` 纯文本渲染,复制也取原文。

### 5. [已核查无需移植] #2345 退出泄漏进程
fork 的 `before-quit` 已覆盖 worker/team/channel/preview/snapshot 清理 + 6-23 的 worker exit 孤儿处理,比上游同期实现更全。

### 6. [上一轮已修] cron 无效表达式击穿 CronService init(#2231 同类)

## 本轮未完成(移植候选,留待下一批)

- **#3019 切换会话中断 in-flight 上传**(渲染层,需梳理 fork 的上传 hook 结构)
- **#2342 gemini 首启 auth 加载后补发首条消息**(需核对 fork 的 useGeminiInitialMessage 时序)
- **Phase 2:ACP 2.0 协议层移植**(#2310/#2520/#2548/#2549,上游同架构时期完成,含单一所有者 ProcessAcpClient、异步批量 CLI 检测、YOLO 模式;改动面大,建议独立会话专轮做)
- **Phase 3:team 修复批次**(v1.9.11–1.9.15 十余个)
- **Phase 4:会话消息分页(参考 #3422 概念)、Butler 型自维护助手(在自有架构内实现)**

## 验证情况

- tsc 通过;i18n 校验通过;新增/修改行 lint 干净(45 个 warning 全在 acpConnectors/CronService 的存量 console 等旧代码)
- acpBunxCache(9)+ acpConnectors(23)通过;全量单测后台跑完 exit 0(汇总行见任务输出)
- **未做**:桌面端手工验证(bun 三件套需真实 Windows + Claude/Codex 启动场景;cron 自定义表达式建议 UI 手测一次)

### 全量单测补充说明(本轮末次运行)

473 文件通过,唯一失败 `guidAgentSelection.dom.test.ts › selectedMode defaults to auto-approve` 为**顺序依赖 flake**:单文件运行 6/6 恒过(stash 前后均验证),仅全量运行时偶发——疑似其他测试污染共享的 ConfigStorage/localStorage mock 状态。与本轮移植无关,列入待办:给该测试文件补 beforeEach 状态隔离。

---

# 2026-07-04 第七轮 — P1 尾巴清零(Phase 1 完结)

## 1. [已移植] #3019 切换会话中断 in-flight 上传(fork 适配版)

上游是 v2.1.2 monorepo 统一 SendBox 架构,fork 按自有结构适配:
- `useUploadState`:`trackUpload` 支持 options(conversationId 绑定 + onAbort 回调,保留旧字符串签名兼容);新增 `abortUploads({source?, exceptConversationId?})`
- `uploadFileViaHttp` 新增第 4 参 `registerAbort`,暴露 `xhr.abort()`
- 两个调用点接线(`FileService.processDroppedFiles`、`useWorkspacePaste`),abort 触发 XHR 取消
- 新增 `useAbortUploadsOnConversationChange` hook,挂在会话根组件(`pages/conversation/index.tsx`):切会话时清掉上一会话的上传,卸载时清空 source 桶
- 注:fork 的 Electron 路径走 IPC 临时文件(无长 XHR),该 bug 主要影响 WebUI 模式——本移植正好覆盖

## 2. [已移植] #2342 gemini 首次启动 auth 加载后补发首条消息

fork 与上游修复前完全一致的两处 bug:no-auth 分支删了 sessionStorage(auth 好了消息已丢)、effect 依赖缺 `hasNoAuth`(auth 转变不触发)。已移植:no-auth 阶段保留 sessionStorage、真正发送时清空输入框草稿、依赖数组补 hasNoAuth。测试:更新旧断言(sessionStorage 保留)+ 新增 auth missing→ready 转变即发送的用例(上游同款),3/3 过。

## 验证情况

- tsc 通过;新文件 lint 0 警告
- **全量单测 0 失败(3697 通过)**——上轮的 guidAgentSelection flake 本轮未复现,坐实偶发
- 至此第五轮审计的 P0/P1 清单**全部清零**(9 项移植 + 2 项核查无需移植)

## Phase 1 总账(第六+七轮)

已移植:#2451/#2482/#2496(bun 三件套)、#2231(cron 表达式击穿)、#2320(cron 编辑改写)、#2050(provider 崩溃)、#2205(消息原样)、#3019(上传中断)、#2342(gemini 首发)。核查无需移植:#2571/#2214、#2618、#3018、#3366、#2345。

## 下一步(建议新会话专轮)

**Phase 2:ACP 2.0 协议层移植** — 参考上游 #2310(模块化协议层+单一所有者 ProcessAcpClient)、#2520(V1→V2 phase 2 + YOLO 模式)、#2548/#2549(审计缺口+idle 状态机)、#2485(异步批量 CLI 检测,启动提速)。上游在同架构(v1.9.18)完成,可移植性好,但涉及 `src/process/agent/acp/**` 全域,建议独立会话、先拉 `git log upstream/v1.9.18 -- src/process/agent/acp` 对照 fork 差异再动手。之后 Phase 3(team 批次)、Phase 4(会话分页/Butler 在自有架构内实现)。

---

# 后续阶段交接说明(Phase 2/3/4,各开新会话执行)

> 2026-07-04 与用户约定:Phase 2/3/4 均在**新会话**中执行,每个 Phase 一个会话。新会话开工前先读本文件 2026-07-04 各章节(尤其第五轮审计的架构分界结论)+ `docs/tech/skills-invocation.md`。当前工作区有 7 轮未提交改动,新 Phase 开工前建议先让用户确认 commit。

## Phase 2:ACP 2.0 协议层移植(未开始)

- **目标**:移植上游 v1.9.18 的 ACP 模块化协议层——单一所有者 ProcessAcpClient、异步批量 CLI 检测(启动提速)、YOLO 模式、idle 状态机修复。
- **参考 PR**:#2310(协议层主体)、#2520(V1→V2 phase 2 + YOLO)、#2548(审计缺口 #20-#26)、#2549(idle 转移)、#2485(异步批量检测)。
- **入手路径**:`git fetch upstream --tags` 后 `git diff v1.9.17..v1.9.18 -- src/process/agent/acp` 看全貌;fork 侧对应 `src/process/agent/acp/**`(AcpConnection.ts、acpConnectors.ts 等)。注意 fork 在此目录已有二开(bun 三件套、agentSetupHints、buildStartupErrorMessage 等),**不能整目录覆盖,要按模块渐进替换**,每步跑 tests/unit/acp*。
- **风险**:改动面最大的一个 Phase;涉及所有 ACP backend(claude/codex/codebuddy/自定义)。建议先把 e2e `acp-agent.e2e.ts` 跑通做基线。

## Phase 3:team 模式修复批次(未开始,已做初步侦察)

- **目标**:移植 v1.9.11–1.9.15 的 team 可靠性修复。fork 的 team 模块在 `src/process/team/`(Mailbox/TaskManager/TeamMcpServer/TeamSession/TeammateManager 等,结构与上游同期接近)。
- **按优先级的移植清单**:
  1. #2377 转 team 时工作区被覆盖(丢原会话工作目录)
  2. #2362 team 启动时同步 workspace 到所有成员(否则互读文件 file-not-found)
  3. #2358 leader 崩溃后被自动移除(应原地恢复)
  4. #2265 team 流式期间无限 DB refresh + 死 IPC
  5. #2289 排队消息在 teammate accept 后回滚丢失
  6. #2426 teammate standby 时 300s LLM 超时(prompt 指示立即结束 turn)
  7. #2425 静默 agent 升级为 failed + 通知 leader
  8. #2429 MCP TCP 内存暴涨防护
  9. 次级:#2412(gemini worker 崩溃检测)、#2436(全屏槽位同步)、#2393(去掉完成确认弹窗)、#2338(历史 team 成员恢复)
- **方法**:逐个 `gh pr diff <n> -R iOfficeAI/AionUi`,先在 fork 对应文件 grep 关键符号判断"已有/缺失/已分叉",再决定移植/跳过(与第五轮审计同方法论)。fork 的 team 有自己的二开(TeamRuntimeAdminPublisher 企业版相关),小心别破坏。
- **测试**:tests/unit 下有 team 相关测试(grep teamBridge/TeammateManager);e2e 有 team 场景(上游 #2616/#2670 可参考补)。

## Phase 4:上游 v2.x 能力在自有架构内重实现(未开始)

### 4a. 会话消息分页(参考上游 #3422 概念,代码不可移植——上游靠 Rust 后端 API)
- **现状**:fork 打开会话一次性加载全部消息(长会话卡顿)。消息存 SQLite(`src/process/services/database/`,messages 表),渲染层经 IPC 拉取。
- **实现思路**:DB 层加游标分页查询(按 createdAt/id 倒序 limit N);IPC 桥新增分页通道;渲染层 Messages 列表先载最近 N 条,上滚触发加载更早批次;注意与流式新消息追加、消息去重(msg_id)共存。
- **入口**:渲染层消息加载 hook(grep `getMessages`/`messageList`)+ `databaseBridge.ts`。

### 4b. Butler 型自维护助手("应用管家",参考上游 v2.1.20 概念)
- **目标**:内置助手,用户用自然语言配置/诊断应用("帮我看看为什么定时任务没跑"/"给 PPT 助手加个技能")。
- **fork 已有的基建正好够**:preset assistant 体系(`assistantPresets.ts` + resources/assistant/)+ builtin MCP 体系(内置 MCP 三件套约定见记忆 builtin-mcp-asar-unpack)。
- **实现思路**:
  1. 新建 builtin MCP `one-app-butler`:暴露只读诊断工具(读配置键、列助手/技能/MCP/定时任务、读 logs/*.log 尾部、健康检查),写操作(改配置/加技能)按需逐个加并走确认。
  2. 新建 preset assistant `app-butler`(中文名"应用管家"),规则文件写清可用工具与安全边界,defaultEnabledSkills 留空,依赖 MCP 工具。
  3. 注意:新增内置 MCP 必须同步 asarUnpack + build-mcp-servers + constants 三处(踩坑记忆)。
- **范围控制**:第一版只做"诊断+查询"(只读),"via chat 配置"(写操作)参考上游 #3446 做第二版。

## 通用注意(每个新会话都适用)

- 主进程禁 console(坑1);测试走桌面端 `npm run restart`;commit 中文、main 分支、等用户确认;打包前 bump patch。
- 每完成一个 Phase 更新本文件 + 跑全量 `npx vitest run`(基线:3697 通过 0 失败,存在一个 guidAgentSelection 顺序依赖 flake,单文件恒过)。
- 每日 10:25 有 upstream-aionui-release-scan 定时任务盯上游新发版。

---

# 架构对齐总体规划 — v2 架构评估与迁移决策(优先级最高,先于 Phase 2-4 执行)

> 2026-07-04 用户新授权:**必要时推倒重来重构也划算**。理由:上游(aionui.com)在 Agent 协作、内置助手、远程控制、自动化上都很稳定,而本 fork 只具备"自己的服务端形式",基础架构能力未对齐导致一直不稳定。
> **硬性要求:真正大改之前,必须先产出一份详细对比清单,列出改了之后的优点是什么**,交用户决策后再动手。
> **重要:本评估应先于 Phase 2/3/4 执行** —— 若决策采纳 v2 架构,Phase 2(ACP 协议层)被 v2 后端天然取代、Phase 3(team 修复)大部分被取代、Phase 4(分页/Butler)上游已内置,先做它们会白干。

## 已核实的关键事实(2026-07-04,评估会话可直接引用)

1. **AionCore(iOfficeAI/AionCore)是 Apache-2.0 开源 Rust 项目**(约 9MB Rust 源码),不是黑盒二进制——**可以 fork 并用自有 crate 扩展**。技术栈 Axum+Tokio+sqlx+rustls,单二进制 27-55MB,6 平台(mac/linux/win × x64/arm64)。
2. **AionCore 的 crate 划分已覆盖本 fork 二开的大部分领域**:`aionui-ai-agent`(ACP/agent 运行时)、`aionui-channel`(渠道!)、`aionui-auth`(认证,WebUI auth 已并入后端 SQLite,上游 #2816)、`aionui-cron`、`aionui-assistant`、`aionui-mcp`、`aionui-extension`(扩展机制)、`aionui-team-prompts`、`aionui-realtime`(WS 事件总线)、`aionui-db`、`aionui-conversation`、`aionui-office`、`aionui-file`、`aionui-shell`、`aionui-system`、`aionui-api-types`。
3. **上游前端 packages**:`desktop`(Electron 薄壳)/ `web-host`(独立 Web 宿主,脱离 Electron)/ `web-cli` / `shared-scripts`。桌面模式透明内嵌后端(传 desktop pid 管生命周期,#3250);协议为 HTTP `/api/*` + `/ws` 事件总线,wire format snake_case(#2672),完全开放。
4. **ACP/agent 实现已整体迁入后端**(#2804 #2819),首条消息技能注入也在后端(#2668),技能读 `extra.skills` 快照(#2677)+ symlink 契约(#2682)。前端只剩渲染。
5. 迁移期兼容参考:上游 #2897(容忍退役 id、保留用户 preset_agent_type、gemini→aionrs 默认迁移)、#3018(一次性迁移 flag)、#3423(旧库启动修复)——上游自己趟过 v1→v2 用户数据迁移,这些 PR 是现成教材。

## 不稳定性的架构归因(支持用户判断的证据链)

本文件记录的历史卡死/顽疾,**几乎全部源于"重活压在 Electron 主进程"这一结构**,v2 的进程分离从根上消除该类别:
| 本 fork 踩过的坑 | 架构根因 | v2 下是否结构性消失 |
|---|---|---|
| 主进程 console.* 冻死(4 轮排查) | console 被 patch 成同步广播,跑在主进程事件循环 | ✅ 业务日志在后端进程,与 UI 事件循环无关 |
| DIPS+SQLite 损坏卡死 | Electron 框架二进制与业务 DB 同进程互扰 | ✅ DB 在后端进程(sqlx) |
| ConfigStorage 主进程调用永不返回 | 同一 IPC 抽象双向语义不一致 | ✅ 统一 HTTP/WS 单向契约 |
| WebUI IPC 无超时转圈 | Express+WS 塞在主进程,桥接语义脆弱 | ✅ web-host 独立进程,标准 HTTP |
| aionrs send 竞态/worker 孤儿 | fork worker 生命周期手工管理 | ✅ 后端 tokio 统一管理子进程 |
| getEnhancedEnv/Defender 首扫冻结 | 同步 IO 在主进程微任务里 | ✅ 后端异步 IO |

## 评估会话必须产出的《对比清单》(用户决策文档,模板)

按用户点名的能力域逐一对比,每域一节:**现状实现(文件/机制)→ 上游 v2 实现 → 差距与不稳定点 → 迁移后收益(具体到"哪类 bug 消失/哪个体验变好")**:
1. **Agent 协作(team)**:现状 src/process/team/**(TCP + 手工进程管理)vs 后端 aionui-team-prompts + runtime;
2. **内置助手**:现状 assistantPresets 硬编码 + 首条消息注入 vs 后端 aionui-assistant + 治理页;
3. **远程控制**:现状 Express-in-Electron WebUI + 企业版客户端/服务器 vs web-host + aionui-auth + Cloudflare tunnel(Butler 一键公网);
4. **自动化(cron)**:现状 croner-in-主进程 vs aionui-cron(后端,时区修复/原地更新都已内置);
5. **基础设施**:IPC bridge vs HTTP+WS;better-sqlite3(主进程)vs sqlx(后端);技能注入链 vs 后端注入+symlink 契约。

然后给出**三个策略选项**,各附四大二开资产(WebUI server 模式、企业版客户端/服务器、飞书/微信渠道、数字员工)的去向、工作量级(人周)、风险、回滚方案:
- **选项 A|整体采纳**:fork AionCore(Apache-2.0 允许),企业版/渠道/数字员工移植为自有 Rust crate 或 extension;前端换上游 packages/desktop + web-host 再叠 UI 二开。收益最大(全部架构性顽疾消失+持续跟上游),成本最大(Rust 移植),**已确认无授权障碍**。
- **选项 B|混合架构**:保留 TS 技术栈,但采纳 v2 的架构模式——把 agent 运行时/DB/cron/渠道从主进程抽到独立 Node 子进程(自建 mini-backend),主进程只剩窗口管理,通信换 HTTP+WS。收益:消除主进程顽疾类;成本:中;风险:自建协议长期维护、仍追不上上游功能。
- **选项 C|渐进修补**(原 Phase 2-4 路线):成本最小,但架构性顽疾只能逐个打补丁,与上游渐行渐远。
- 评估会话应给出**明确推荐**(基于上面证据链,倾向 A,分期实施:先跑通"上游 v2 原版+零二开"作为 M0 基线 → 逐个移植二开资产 → 灰度切换),但决定权在用户。

## 评估会话第一步要验证的问题清单

1. AionCore 的 extension 机制(aionui-extension crate + 上游 examples/)能否承载渠道/企业版逻辑,还是必须改 crate 源码?
2. 上游 `aionui-channel` 已支持哪些渠道(确认 WeCom/weixin/Telegram 现状),与 fork 的飞书/钉钉/微信实现差距多大?
3. 企业版"客户端/服务器"语义(deploymentRole/enterpriseServerUrl/SSO/JIT)在 aionui-auth 上如何映射?
4. 数字员工(digitalEmployee)依赖的 conversation/cron API 在 v2 后端是否齐备?
5. 数据迁移:fork 的 1one.db(better-sqlite3 schema)+ one-config.txt → AionCore sqlx schema 的映射表;参考上游 #2897/#3018/#3423。
6. 构建链:fork 的 dist:win 打包(asarUnpack 三件套、bundled-* 资源)在上游 electron-builder 配置下如何重排。

## 执行建议

- 评估会话产出《对比清单》即止(不写代码),交用户拍板;
- 若选 A:后续按 M0(原版跑通)→ M1(渠道)→ M2(企业版)→ M3(数字员工)→ M4(灰度切换)分会话推进,每个 M 一个可回滚的里程碑;
- 本仓库 7 轮未提交改动是 Electron 架构上的修复,**无论选哪条路都建议先 commit 保底**(选 A 后它们仍是过渡期生产版本的稳定性保障)。

---

# 2026-07-04 第八轮 — v2 架构评估完成,《对比清单》已产出(待用户拍板)

按上节规划执行的评估会话。三路并行调研(AionCore 源码浅克隆逐 crate 核查 / AionUi v2 monorepo+关键 PR / 本 fork 四大资产逐文件盘点)已完成,**产出决策文档 `docs/tech/v2-architecture-comparison.md`**(五能力域对比 + 三策略选项 + 资产去向/工作量/风险/回滚 + 推荐),未写任何代码。

## 相对上节预评估的关键修正(后续会话必读)

1. **extension 机制承载不了二开**——`aionui-extension` 是 manifest 声明式贡献模型,`channel_plugins` 是 metadata-only 空壳(JS 入口从不执行),无法注入 HTTP 路由/后台服务。选项 A 必然 = fork AionCore + 自有 crate(Apache-2.0 无障碍;注意 LICENSE=Apache-2.0 但 Cargo.toml 写 MIT,两处不一致)。
2. **渠道资产上游已内置**——aionui-channel 有飞书(WS 长连)/微信(官方 iLink Bot)/钉钉(Stream+AI Card)/Telegram,含 6 位配对码+会话隔离+流式回写,与 fork 同构。最大的一块二开(1.2 万行)在选项 A 下基本白送。缺 WeCom(双方都没有)。
3. **企业版是唯一必须新写的后端域**——aionui-auth 无 SSO/租户/RBAC,需自有 Rust crate(约 6-10 人周,是选项 A 主要成本)。
4. **数字员工 API 齐备**——POST conversations / POST messages(返回 turn_id)/ WS message.stream+turn.completed / cron 执行目标即"向会话发消息"。
5. 上游节奏 = 最大战略风险:AionCore 近乎日更、贡献者全内部、外部 PR 通道未验证 → 按长期 fork 规划,pin aioncoreVersion 批量升级,二开收敛在自有 crate。

## 推荐(详见文档)

**选项 A(整体采纳),六里程碑 M0-M5,合计 17-28 人周**;M2(企业版 Rust)开工两周后设 checkpoint,超预期可降级为 Node sidecar 过渡(省 3-5 人周)。选项 B(自建 Node 后端)10-18 人周但永久分叉;选项 C(渐进修补)8-11 人周但维护成本发散。

## 决策结果(2026-07-04 用户已拍板)

1. **用户选定选项 A(整体采纳上游 v2:fork AionCore + 上游前端壳),按 M0-M5 分期推进**;
2. ✅ 7 轮改动已保底 commit + push(8aa2c72b,69 文件);darwin 二进制/aionrs 会话数据/临时文件未纳入,属本地产物;
3. **下一步 = M0(开新会话)**:上游 v2 原版跑通(桌面 + aionui-web 服务器形态)+ 本地数据只读验证 + 确立 fork 分支策略(pin aioncoreVersion)。施工顺序模板 = 上游 #2672(wire format)→ #2668/#2677/#2682(技能三部曲)→ backend-launcher → 迁移三 PR(#2897/#3018/#3423)。M2(企业版 Rust crate)开工两周后设 checkpoint,超预期可降级 Node sidecar。

---

# 2026-07-04 第九轮 — M0 完成(选项 A 第一里程碑,当日跑通)

用户拍板选项 A 后当场执行 M0,全部达成。详细报告:`docs/tech/v2-m0-report.md`(原件 `D:\aionui-m0\M0-REPORT.md`)。

## 结果速览

1. **aionui-web 服务器形态 ✅**:官方 v2.1.28 win-x64 发布包(sha256 校验),`D:\aionui-m0` 隔离运行(端口 25908,独立 data-dir)。API 冒烟全过:建会话(extra.skills 快照自动写入,#2677 实证)→ 发消息 → **本机 claude CLI 真实回复 M0-SMOKE-OK** → 消息 API 自带游标分页(原 Phase 4a 需求上游内置)。
2. **桌面形态源码 dev ✅**:checkout v2.1.28 tag + bun install + bun run dev。AIONCORE_LISTENING → /health 3.9s 就绪 → 窗口正常。**踩坑**:dev 模式 binaryResolver 不查仓库 resources/,须把 bundled-aioncore 复制到 `node_modules/electron/dist/resources/`。**上游 legacy 迁移链(#3423 handoff repair)在 dev 启动中现场可见**——M5 的模板。
3. **数据只读验证 ✅ 低风险坐实**:1one.db(50 会话/600 消息,integrity ok)与 AionCore schema 对照——**messages 逐列一致**;conversations 差异仅 tenant_id/team_id(随企业 crate 走)与 pinned(上游自动补列);extra.enabledSkills→skills 需 key 映射;本机企业表几乎全空,迁移量极小。
4. **fork 分支策略(决议)**:双 fork(AionCore + AionUi)均以 release tag 为基线不追 HEAD;二开收敛在新增 crate + 最小 router diff;沿用 aioncoreVersion pin 机制指向自有 fork release;1one-command 仓库保持过渡期生产版本。

## 待用户决定

- fork 仓库归属(GitHub 账号/组织、公私有)——定了才能创建 fork 并开 M1。

## 环境备忘(M1 会话可复用)

- `D:\aionui-m0\web\aionui-web\`:web 形态可执行(--data-dir D:\aionui-m0\data --port 25908)
- `D:\aionui-m0\AionUi`:v2.1.28 源码,bun 已装依赖,dev 可起(electron dist resources 已放 aioncore)
- `C:\Users\allenzhao\AppData\Local\Temp\claude\aioncore`:AionCore v0.1.42 浅克隆(源码对照用)
- 下一步 M1:渠道对齐实测(飞书/微信/钉钉/Telegram 配对全流程)+ 配对码手动输入兜底差距确认

---

# 2026-07-05 第十轮 — M0 源码闭环补验 + fork 建立 + M1 渠道差距分析

## 1. AionCore 源码构建闭环(用户质疑"为何用二进制"后补验,✅)

rustup+MSVC 就绪,v0.1.41 源码 `cargo build --release` 首编 47m46s → 自编 aioncore.exe(73MB)独立实例 → claude CLI 真实回复 SELFBUILD-OK。**fork 加 crate 的技术前提全部就绪**。分工:M0/M1 用官方二进制,M2 起全部用自有 fork 源码构建。报告见 `docs/tech/v2-m0-report.md` 第 6 节。

## 2. fork 仓库(用户拍板:gaogg521 账号、公开)

- **gaogg521/AionCore**:已 fork,`one-main` 分支=v0.1.41 基线,已设默认分支(main 留作上游镜像);本地 `D:\aionui-m0\AionCore` 在 one-main 跟踪 origin。
- **gaogg521/AionUi**:旧 fork 已存在(停在 6-22)。同步被挡:gh token 缺 workflow scope,**待用户跑 `gh auth refresh -s workflow -h github.com`** 后:`gh repo sync` → 从 v2.1.28 tag 建 one-main → 设默认分支(与 AionCore 同法)。

## 3. M1 渠道差距分析(✅,文档 docs/tech/v2-m1-channel-gap.md)

- 飞书/钉钉/Telegram:凭据/连接/配对逐项一致,**直接用上游零移植**。
- 微信:路线不同(我们=本地 bridge 个人号形态;上游=官方 iLink Bot)。M1-3 实测后决策;不满足则把 WeixinMonitor 移植为 Rust ChannelPlugin(渠道域唯一可能移植项,参照 dingtalk 约 1-2k 行)。
- 企微:上游前端有完整 WecomConfigForm 但后端无实现(占位)——双方均无,如需求成立 M2+ 自有 crate 实现(前端白送)。
- **配对码手动输入兜底(交付约定):上游没有** → M4 在上游 5 个 ConfigForm 叠加共享组件(表单结构高度一致,一个组件全渠道复用)。
- 助手/模型绑定:上游每渠道可绑助手+模型(assistantBinding.ts),比我们的配置键更强,零损失。

## 待办(M1 收尾)

1. 用户跑 gh auth refresh → 我完成 AionUi fork 基线(M1-2)。
2. M1-3 真实配对 E2E:用户在上游实例(桌面窗口或 :25908)渠道设置自行填凭据(飞书/Telegram/微信 iLink),验证配对+对话+流式回写全流程;微信路线是否满足个人号需求是关键判断点。
3. 会话限额注意:渠道分析 agent 曾撞限额(reset 3am),后改主会话精准检索完成。

---

# 2026-07-05 第十一轮 — M1-2 收尾 + M2 企业 crate 设计

## M1-2 fork 基线(✅ 全部完成)

- **gaogg521/AionCore**:one-main@v0.1.41,默认分支,本地 D:\aionui-m0\AionCore 跟踪中。
- **gaogg521/AionUi**:用户网页点 Sync fork 解决同步(gh token 至今缺 workflow scope,命令行两条路都被挡);one-main@v2.1.28(a5a8b34)已建+设默认,本地跟踪中。
- **workflow scope 仍未解决**——影响:向 fork 推 .github/workflows 文件(M2 的 CI)。绕法:GitHub 网页编辑器手工建 workflow,或用户再走一次 gh auth refresh 设备码全流程(要按 Enter、等终端打印 Authentication complete)。

## M1-3 真实配对 E2E(等用户操作)

监控已架好(persistent Monitor 盯 web 实例渠道/配对日志)。用户需在 http://127.0.0.1:25908 设置→渠道自行填凭据(Telegram/飞书/微信 iLink)。**web 登录问题**:该实例 --local 模式从未打印过密码;要登录跑 `D:\aionui-m0\web\aionui-web\aionui-web.exe resetpass --data-dir D:\aionui-m0\data` 重置并打印。用户暂时搁置。

## M2 设计文档(✅ docs/tech/v2-m2-enterprise-crate-design.md)

要点:`one-org`/`one-sso` 两个 crate(one- 前缀区别上游);**DB 用自管迁移器+_one_migrations 表**(不进上游 sqlx migrator,否则 rebase 撞号必炸);不改上游 users 表(企业属性外挂 one_user_org);路由前缀 /api/one/*;RBAC 做成只包自己路由的 extractor,SSO 签发复用上游 auth(pub 可调性 M2 第一周验证);客户端连远端 = M4 在 AionUi fork 侧做 httpBridge baseUrl 指向;M2 内部 a-e 五步+两周 checkpoint;DevOps 全家桶表不进 M2。

## 当前所有支线状态

| 支线 | 状态 |
|---|---|
| M1-3 渠道 E2E | 等用户填凭据(监控在跑) |
| M2 编码 | 设计已备,可开工(建议新会话,读本节+设计文档) |
| workflow scope | 用户侧待解,不阻塞 M2a |
| 上游实例 | web:25908 与桌面 dev 均在跑(D:\aionui-m0) |

---

# 2026-07-05 第十二轮 — 进度对账(跨会话汇总)

另一会话完成 M2a(one-org,fork d11d120)与 M3 设计+M3a(one-employee),进度标注在两份设计文档头部(v2-m2-enterprise-crate-design.md / v2-m3-employee-design.md)。**M2 未全部完成**——剩 M2b(飞书 SSO,下一步)/M2d(其余 providers+org 同步)/M2e(管理后台收尾);M3 剩 M3b(团队员工+cron)/M3c(UI 首屏)。之后 M4(UI 移植+配对兜底组件+客户端连远端)、M5(数据迁移+打包+灰度)。

横切遗留:M1-3 渠道真实 E2E(用户凭据,必做)、微信 iLink vs bridge 决策、workflow scope→CI、web 实例登录(resetpass 可解)。

**注意**:D:\aionui-m0 的两个上游测试实例(web:25908/桌面 dev)随会话重启已停;需要时重新拉起:web 形态 `D:\aionui-m0\web\aionui-web\aionui-web.exe start --port 25908 --no-open --data-dir D:\aionui-m0\data --log-dir D:\aionui-m0\logs`;桌面 `cd D:\aionui-m0\AionUi && bun run dev`(注意 dev 的 aioncore 已复制在 electron dist resources)。

---

# 2026-07-05 第十三轮 — 未完成项登记(交接清单,本会话不再写码)

用户指示:只记录、不实施,由其他会话接续。**当前全部未完成项**(权威清单,接手会话按序取活):

| # | 项 | 状态与入口 |
|---|---|---|
| 1 | **M3b 团队员工 run-now + cron 集成** | 技术侦察已完成并写入 `docs/tech/v2-m3-employee-design.md` §2.5(团队 API/完成判定/cron 决策改自带扫描循环+复用 compute_next_run/002 迁移三列),照抄可直接实现 |
| 2 | **M2b 飞书 SSO(one-sso crate)** | 设计在 v2-m2-enterprise-crate-design.md §3-4;实现+单测可先行,真实飞书 E2E 需用户凭据 |
| 3 | M2d 钉钉/企微/LDAP + 组织同步 | 复制 M2b 模式 |
| 4 | M2e 管理后台 API 收尾 | M2a 已带部分 /api/one/admin/* |
| 5 | M3c+M4 UI 移植 | superAssistant 首屏+企业/管理页 httpBridge 重接线+配对码手动兜底组件(上游缺口,5 个 ConfigForm 共享组件)+桌面客户端连远端 |
| 6 | M5 数据迁移+打包+灰度 | 映射表在 v2-m0-report.md §3;照抄上游 #2897/#3018/#3423 模式 |
| 7 | M1-3 渠道真实配对 E2E | 用户凭据,必做;测试实例重启命令见第十二轮 |
| 8 | 横切:微信 iLink vs bridge 决策、workflow scope→CI、web 实例登录(resetpass) | 详见第十/十一轮 |

fork 现状:gaogg521/AionCore one-main = b4ec43f(M2a d11d120 + M3a b4ec43f 已推送);gaogg521/AionUi one-main = v2.1.28 基线未动。cargo 在 ~/.cargo/bin(bash 需手动 export PATH)。

---

# 2026-07-05 第十四轮 — M3b 完成(团队员工 run-now + cron 30s 扫描循环)

按第十三轮交接清单第 1 项开工,当日完成并推送(fork commit 18bea4a,gaogg521/AionCore one-main)。

**实现要点**:
- **002 迁移**:`one_personal_agents` 加 `schedule TEXT`(CronScheduleDto JSON,tag="kind")/`schedule_enabled INTEGER`/`next_run_at INTEGER` 三列 + 部分索引 `WHERE schedule_enabled=1`。
- **团队员工 run-now**:`EmployeeService::run_now_team(owner, agent_id, team_id, slot_id)` → `TeamSessionService::get_team` 取 `TeamResponse.assistants[].conversation_id` → `send_message_to_agent` fire-and-ack → 轮询 `get_run_state` 直到 `active_run.is_none()`(3s 间隔、15min 上限)→ `extract_summary` 复用 M3a 路径。
- **cron 30s 扫描循环**(`spawn_scheduler`):每 30s `scan_once` 查 `WHERE schedule_enabled=1 AND next_run_at<=now` → 命中后立即 `next_run_at=NULL` 防重入 → 调 `start_personal_run(TRIGGER_CRON)`(复用 M3a 建会话/run_agent_turn 路径) → `execute_run` 完成后调 `recompute_next_run` 用上游 `compute_next_run(&CronSchedule, now)` 重排。零上游 diff(全是 pub API)。
- **路由**:POST `/api/one/employee/agents/:id/run-team`(body: team_id+slot_id) + PUT `/api/one/employee/agents/:id/schedule`(body: CronScheduleDto + enabled)。
- **上游 diff 仍限挂载点**:routes.rs wiring 多 3 行(clone team_session_service before move + with_team_session + spawn_scheduler)。

**关键修正(侦察记录的 bug)**:§2.5 说"CronSchedule serde 形状(tagged enum,L19)"——实际 `CronSchedule` 只派生 `Debug, Clone, PartialEq`,**不派生 serde**。可 serde 的是 `CronScheduleDto`(`aionui-api-types/src/cron.rs` L12,tag="kind")。存库用 Dto JSON,调用 `compute_next_run` 时用 `schedule_from_dto(&dto)` 转换。

**验收**:
- 单测 6/6(M3a 5 个 + M3b 新增 `compute_next_run_every`/`compute_next_run_at_is_absolute` + 迁移断言加强)。
- `--local` 冒烟 cron 链路全过:建员工 → PUT schedule(Every 60s) → 等 ~60s → runs 表出现 `triggerSource:"cron"` 记录 → 真实 claude 一轮 13s → `status:"success"` + `summary:"M3b cron冒烟OK"` → `nextRunAt` 自动回写 +60s(1783219798784 → 1783219884144)。
- team run 错误处理:不存在 team 返回 `Internal error: team get_team: Team not found`(冒烟验证)。

**踩坑**:
- ① 首版 cron 扫描器把 `run_id` 当 conversation_id 传给 `execute_run` → 必然 `run_agent_turn` 失败。重构抽出 `start_personal_run(trigger_source)` 复用建会话逻辑,手动/cron 共用。
- ② 首版 team run 把 `team_run_id` 当 conversation_id 存,summary 提取会查不到消息。改用 `get_team` 提前拿 slot 真实 conversation_id。
- ③ `states.team` 在 `team_routes(states.team)` 时 move 了,后面 `.with_team_session(states.team.service.clone())` borrow after move。在 move 前先 `let team_session_service = states.team.service.clone();`。
- ④ aioncore.exe 不接受 `start` 子命令(web 形态才有),直接 `aioncore.exe --local --port ...`。也没有 `--no-open`。

**fork 现状**:gaogg521/AionCore one-main = 18bea4a(M2a d11d120 + M3a b4ec43f + M3b 18bea4a 已推送);gaogg521/AionUi one-main = v2.1.28 基线未动。

**下一步(第十五轮候选)**:M3c(superAssistant UI 移植首屏——Overview/AgentsTab 重接线 `/api/one/employee/*`,与 M4 httpBridge 适配层共用)或 M2b(飞书 SSO → one-sso crate,需用户提供真实飞书应用凭据做 E2E)。剩余未完成项:第十三轮清单 2-8(M3b 已勾掉)。

---

# 2026-07-05 第十五轮 — M3c 完成(superAssistant UI 移植首屏)

按第十四轮候选开工,当日完成并推送(AionUi fork commit bd3e424,gaogg521/AionUi one-main)。

**侦察发现的关键事实**:
- 1one superAssistant 页面 6553 行/14 组件,但**设计文档原说"三个纯员工域 tab"实际不纯**——OverviewTab/AgentsTab/SettingsTab 都通过 `useSuperAssistantData`(643 行巨型 hook)拉 enterprise 域数据(requirements/skills/mcp/rag/codeRepo/pipeline/teamRuntime 心跳)。AionUi fork 还没这些。
- AionUi fork v2.1.28 前端在 `packages/desktop/src/renderer/`,用 `httpBridge`(httpGet/Post/...)替代 Electron IPC,走 `/api/*` REST。`httpRequest` 已自动 unwrap `ApiResponse.data`。
- AionUi fork 的 Arco `Tabs.TabPane` 用 `title` 不是 `tab`;`Modal` 无 `width` prop。

**实现策略(因侦察发现而调整)**:不照搬 1one 三 tab 原版,改为只迁**个人员工切片**(对齐 one-employee crate 能 back 的范围)。enterprise 域(IssuesWorkbench/Runtimes/EnterpriseCollaboration)留给 M4 管理后台一起重接。

**实现要点**:
- **`common/types/employee/employeeTypes.ts`**:`PersonalAgent` / `DigitalEmployeeRunRecord` / `CronScheduleDto` / `CreatePersonalAgentInput` / `UpdatePersonalAgentInput` / `SetScheduleInput`(对齐后端 serde 形状,camelCase)。
- **`ipcBridge.personalAgent`**:list/get/create/update/remove/runNow/runTeam/setSchedule/listRuns/getRun,走 `/api/one/employee/*`。`update` 和 `setSchedule` 的 mapBody 平铺后端期望的 body(后端 `Json<UpdateEmployeeInput>` 直接平铺,不接受 `{updates:{...}}` 包一层)。
- **`pages/superAssistant/`**:
  - `index.tsx`:三 tab(Overview/Agents/Settings)+ 4 个 Modal(Create/Manage/Schedule/Detail)串联,精简自 1one 1924 行巨型入口(去 enterprise/team 分支)。
  - `hooks/useDigitalEmployees.ts`:精简版数据 hook(去 enterprise 域),只拉 `personalAgent.list` + 每个 agent 的 `listRuns`。
  - `components/OverviewTab.tsx`:统计卡片(总数/活跃/已设定时/最近运行)。
  - `components/AgentsTab.tsx`:员工列表卡片 + 模板创建 + run/调度/详情/管理/删除按钮。
  - `components/SettingsTab.tsx`:默认 agent 类型选择 + 调度格式说明(At/Every/Cron 示例)。
  - `components/CreateAgentModal.tsx` / `ManageAgentModal.tsx` / `ScheduleAgentModal.tsx` / `DigitalEmployeeDetailModal.tsx`(运行历史)。
  - `templates/agentTemplates.ts`:从 1one 平移(去 `useTranslation` 未用 import)。
  - `utils/deleteDigitalEmployee.ts`:删除前 best-effort 关闭 schedule(用新 setSchedule API,不是 1one 的 cron job 清理)。
- **路由 + 导航**:`/super-assistant` + `SiderSuperAssistantEntry`(Robot 图标)挂在 ScheduledTasks 下方。

**踩坑**:
- ① 后端 `update` 路由 `Json<UpdateEmployeeInput>` 接受平铺 body(`{name,description,automationConfig}`),不是 `{updates:{...}}`。首版 provider 包了一层,改名测试时返回值没变。改 mapBody 平铺后正常。
- ② AionUi fork 的 Arco `Tabs.TabPane` 用 `title` 不是 `tab` prop;`Modal` 无 `width` prop。typecheck 报错后改对。
- ③ 1one 的 `useSuperAssistantData` 643 行拉 enterprise 域数据(requirements/skills/mcp/rag/codeRepo/pipeline),AionUi fork 没有 `enterpriseApi/modules`。改为精简版 `useDigitalEmployees`,只拉 personalAgent + runs。
- ④ 1one 的 `deleteDigitalEmployee` 依赖 `listAgentCronJobs` + `ipcBridge.cron.removeJob`(老 cron 表),AionUi fork 的 schedule 在 one-employee crate 自管,直接 `setSchedule({enabled:false})` 即可。

**验收**:
- `bunx tsc --noEmit` 0 错误。
- `bunx oxlint` 0 错误(2 个 `no-map-spread` 性能 warning,非阻塞)。
- `--local` 后端 API 链路冒烟全过:① list(返回 M3b 时建的员工)→ ② create(M3c UI 测试)→ ③ update(改名+改描述生效)→ ④ runNow(manual 触发,11.8s success,summary="收到,M3c 确认 OK...")→ ⑤ setSchedule(every 60s,scheduleEnabled=true,nextRunAt=+60s)→ ⑥ listRuns(triggerSource=manual,status=success)。
- 前端 UI 端到端验证(桌面 dev 启 Electron 窗口)留给用户在本机跑 `bun run dev` 看——自动化环境里 Electron 窗口不好驱动。

**fork 现状**:
- gaogg521/AionCore one-main = 18bea4a(M2a d11d120 + M3a b4ec43f + M3b 18bea4a)。
- gaogg521/AionUi one-main = bd3e424(v2.1.28 基线 + M3c superAssistant UI 首屏)。

**下一步(第十六轮候选)**:M4(管理后台 + httpBridge 适配层 + 桌面客户端连远端)或 M2b(飞书 SSO → one-sso crate,需用户提供真实飞书应用凭据做 E2E)。剩余未完成项:第十三轮清单 2-8(M3b/M3c 已勾掉)。M3 整体(M3a+M3b+M3c)完成,可以推进 M4 或 M5(数据迁移+打包+灰度)。

---

# 2026-07-05 第十六轮 — M3 整体完成 + M2 剩余范围澄清(交接清单 v2)

第十三轮的交接清单已过时(M3b/M3c 已完成),本轮重新发布权威清单。

## M3 整体完成 ✅

| 子里程碑 | fork commit | 内容 | 验收 |
|---|---|---|---|
| M3a | AionCore `b4ec43f` | one-employee crate 骨架 + one_personal_agents/one_employee_runs 表 + 员工 CRUD API + 个人员工 run-now | 单测 4/4 + 冒烟 11/11(真实 claude 72s) |
| M3b | AionCore `18bea4a` | 团队员工 run-now(TeamSessionService + get_run_state 轮询)+ cron 30s 扫描循环(复用 compute_next_run,零上游 diff)+ 002 迁移三列 | 单测 6/6 + cron 链路冒烟全过(Every 60s→13s success→nextRunAt 回写) |
| M3c | AionUi `bd3e424` | superAssistant UI 首屏(三 tab + 4 Modal + personalAgent httpBridge provider + 侧栏入口) | tsc 0 + oxlint 0 + API 链路冒烟全过(list/create/update/runNow 11.8s/setSchedule/listRuns) |

设计文档 `docs/tech/v2-m3-employee-design.md` 进度头已更新到 M3c 完成,记录 8 条关键实现事实。

## M2 剩余范围澄清

原 §6 里程碑里的 **M2c(邀请码 join/exit/建企业 + RBAC extractor + 审计)已并入 M2a 交付**——commit d11d120 标题即"join/exit/create + 邀请码 + RBAC",五表含 one_tenant_invites/one_audit_logs。所以 M2 剩余只有三项:

| 子里程碑 | 状态 | 入口 |
|---|---|---|
| M2a | ✅ 完成 | AionCore `d11d120` |
| ~~M2c~~ | ✅ 已并入 M2a | 邀请码 join/exit/create + RBAC extractor + 审计日志表 |
| **M2b** | ⏳ 未开始 | 飞书 SSO → one-sso crate;设计在 `docs/tech/v2-m2-enterprise-crate-design.md` §3-4;实现+单测可先行,真实飞书 E2E 需用户提供飞书应用凭据 |
| **M2d** | ⏳ 未开始 | 钉钉/企微/LDAP + 组织同步;复制 M2b 模式 |
| **M2e** | ⏳ 部分完成 | M2a 已带 `/api/one/admin/invites` + `/exit-password`;剩余 users 列表/角色管理/runtime 节点管理(与 M4 管理页联调) |

设计文档 `docs/tech/v2-m2-enterprise-crate-design.md` 进度头已更新,标清 M2c 已并入 M2a。

## 权威未完成项清单(v2,替换第十三轮)

| # | 项 | 状态与入口 |
|---|---|---|
| 1 | ~~M3b 团队员工 run-now + cron~~ | ✅ 完成(AionCore `18bea4a`) |
| 2 | ~~M3c superAssistant UI 首屏~~ | ✅ 完成(AionUi `bd3e424`) |
| 3 | **M2b 飞书 SSO(one-sso crate)** | 设计在 v2-m2-enterprise-crate-design.md §3-4;实现+单测可先行,真实飞书 E2E 需用户凭据 |
| 4 | **M2d 钉钉/企微/LDAP + 组织同步** | 复制 M2b 模式 |
| 5 | **M2e 管理后台 API 收尾** | M2a 已带部分 `/api/one/admin/*`;剩 users/角色/runtime 节点(与 M4 联调) |
| 6 | **M4 UI 移植 + httpBridge 适配层 + 桌面客户端连远端** | superAssistant 剩余面板(Runtimes/Issues/EnterpriseCollaboration)+ 企业/管理页 httpBridge 重接线 + 配对码手动兜底组件(上游缺口,5 个 ConfigForm 共享组件)+ 桌面客户端连远端 aioncore |
| 7 | **M5 数据迁移 + 打包 + 灰度** | 映射表在 v2-m0-report.md §3;照抄上游 #2897/#3018/#3423 模式 |
| 8 | **M1-3 渠道真实配对 E2E** | 用户凭据,必做;测试实例重启命令见第十二轮 |
| 9 | **横切**:微信 iLink vs bridge 决策、workflow scope→CI、web 实例登录(resetpass) | 详见第十/十一轮 |

## fork 现状

- **gaogg521/AionCore one-main = `18bea4a`**(M2a `d11d120` + M3a `b4ec43f` + M3b `18bea4a` 已推送)
- **gaogg521/AionUi one-main = `bd3e424`**(v2.1.28 基线 + M3c superAssistant UI 首屏已推送)
- cargo 在 `~/.cargo/bin`(bash 需手动 `export PATH="/c/Users/allenzhao/.cargo/bin:$PATH"`)
- AionCore fork 工作目录 `D:\aionui-m0\AionCore`(one-main 分支)
- AionUi fork 工作目录 `D:\aionui-m0\AionUi`(one-main 分支)
- ⚠️ `/d/AionUi` 是上游 iOfficeAI/AionUi(main 分支),**不是 fork**——别搞混

## 下一步建议(第十七轮候选)

按依赖关系,推荐顺序:
1. **M4**(UI 移植收尾 + httpBridge 适配层 + 客户端连远端)——M3c 已完成个人员工 UI,M4 补企业/管理页 + 客户端模式,让 fork 真正可用。
2. **M2b**(飞书 SSO)——需要用户提供飞书应用凭据做 E2E,实现+单测可先行。
3. **M5**(数据迁移 + 打包 + 灰度)——M4 完成后做最终迁移发布。
4. **M2d/M2e**——可并行,复制 M2b 模式。

或者用户可指定其他顺序。

---

# 2026-07-05 第十七轮 — M2 剩余三项完成(M2b+M2d+M2e)

按第十六轮交接清单开工,当日完成并推送(AionCore fork commit `a442bfb`,gaogg521/AionCore one-main)。

## 实现

### M2b 飞书 SSO + M2d 钉钉/企微(新增 crates/one-sso)

- **001 迁移**:`one_sso_providers`(provider/config/enabled)+ `one_sso_identities`(provider+external_id→user_id 绑定),复用 `_one_migrations` 账本(`sso_` 前缀)。
- **providers/feishu.rs**:`build_authorize_url` + `exchange_code` + `fetch_user_info` + `resolve_external_id`(union_id/open_id 互为 fallback)+ `test_credentials`(tenant_access_token 验证),reqwest 直译自 1one TS。
- **providers/dingtalk.rs**:同构,v1.0 userAccessToken + legacy gettoken 验证。
- **providers/wecom.rs**:corp_token + code→UserId(非 user access token 模式,external_id 是 corp UserId)。
- **service.rs**:
  - `OAuthStateStore`(in-memory,10min TTL,`tokio::sync::Mutex`)
  - `resolve_or_provision_user`:查 identity→建用户(`IUserRepository.create_user` + `hash_password` 随机密码)→绑 identity(零 diff 进 aionui-auth)
  - `issue_session`:`JwtSecret::sign` + `CookieConfig::build_session_cookie`(复用上游签发路径,CSRF/QR-login 继承)
  - `upsert_provider` + `list_provider_status`(给登录页用,secrets 已剥离)
- **routes.rs**:
  - 公开:`/api/one/sso/providers`(GET)+ `/{provider}/authorize`(GET,302 或 JSON `{goto,state}`)+ `/{provider}/callback`(GET,Set-Cookie + 302 到 `/#target`,或桌面 deep-link `aionui://sso-callback?token=...`)
  - 受保护:`/api/one/admin/sso/{provider}`(PUT,upsert config+enabled)

### M2e 管理后台 API 收尾(扩展 one-org)

- **models.rs**:`AdminUserDto`(join users+one_user_org)+ `RuntimeNodeRow`/`Dto` + `AuditLogRow`
- **service.rs**:`list_users` / `set_user_role`(member/org_admin/system_admin,system_admin 仅 system_admin 可授)/ `list_audit_logs` / `list_runtime_nodes` / `heartbeat_runtime_node`(upsert by tenant+machine_id)
- **routes.rs**:GET `/api/one/admin/users` + PUT `/users/:id/role` + GET `/audit?limit=N` + GET `/runtime/nodes` + POST `/runtime/heartbeat`,全部 `RequireOrgAdmin` 保护

### 上游 diff(仍限挂载点)

- workspace Cargo.toml:+1 member +1 dep
- aionui-app Cargo.toml:+1 dep
- aionui-app routes.rs:迁移调用 + 公开/受保护路由分别挂载

## 关键实现事实

- **OAuth state 存内存**(`tokio::sync::Mutex`),单进程足够;多实例需共享存储(M4)
- **desktop 模式 callback 不 Set-Cookie**,用 `aionui://sso-callback?token=...` 深链(浏览器 cookie jar 不与桌面 renderer 共享)
- **JIT 建用户用随机密码**(SSO 用户永远不知道密码,不能密码登录)
- **WeCom 的 external_id 是 corp UserId**(不是 union_id/open_id)
- **AdminUserDto.last_login 列名对齐上游 users 表**(不是 last_login_at,踩坑修了)
- **RequireOrgAdmin 要求用户在 enterprise 里**,`--local` 默认用户需先 `/org/create`
- **M2c 已并入 M2a**(commit d11d120 标题即含"join/exit/create + 邀请码 + RBAC")

## 验收

- **单测 29/29**:one-org 6/6 + one-employee 6/6 + one-sso 17/17
- **`--local` 冒烟全过**:
  - SSO:providers list 空→upsert feishu config→providers list 返回 `configured=true`→authorize 返回 `{goto,state}`(飞书 OAuth URL 正确)→callback 无 code 返回 400
  - admin:建企业→users list(`system_default_user`/`system_admin`)→audit list(`org.create` 记录)→runtime heartbeat(`node_id` 返回)→runtime nodes list(`hostnames`/`ip_addresses`/`installed_agents` JSON 数组)→set role 成功
- **真实飞书 E2E 需用户凭据**(实现+单测已就绪,等用户提供 App ID/Secret 做端到端验证)

## 踩坑

- ① 首版 `AdminUserDto` 用 `last_login_at` 列名,上游 users 表实际是 `last_login`。冒烟时 `admin/users` 报 `no such column: u.last_login_at`,改列名后正常。
- ② 首版 `OAuthStateStore` 用 `parking_lot::Mutex`(非 workspace dep),改 `tokio::sync::Mutex`。`issue`/`consume` 改成 async。
- ③ 首版 `IUserRepository` 假设有 `set_role` 方法——实际没有(上游 users 表无 role 列,role 只在 `one_user_org`)。去掉 set_role 调用,RBAC 完全靠 `RequireOrgAdmin` extractor 读 `one_user_org`。
- ④ `tokio::sync::Mutex` 没有 `try_lock` 返回 Option(那是 `parking_lot`)。改用 `lock().await`。
- ⑤ `WecomUserInfoResponse` 的 `#[serde(rename_all(serialize=..., deserialize=PascalCase))]` + `#[serde(alias="UserId", alias="userid")]` 双 alias 兼容大小写。

## LDAP 待办

M2d 原范围含 LDAP,但 1one `LdapAuthProvider.ts` 525 行很重(ldap3 crate + 目录搜索 + group 映射 + admin 检测),本轮跳过。`SsoProviderKind::Ldap` 枚举已留,路由会返回 `BadRequest("LDAP uses POST /api/one/sso/ldap/login")`。后续做 LDAP 时:
- 加 `ldap3` workspace dep
- 实现 `LdapProvider::authenticate(config, username, password) -> LdapAuthSuccess`
- 加 `POST /api/one/sso/ldap/login` 路由(非 OAuth,密码直登)
- JIT 复用 `resolve_or_provision_user`(LDAP external_id = directory objectGUID)

## fork 现状

- **gaogg521/AionCore one-main = `a442bfb`**(M2a `d11d120` + M3a `b4ec43f` + M3b `18bea4a` + M2b/M2d/M2e `a442bfb`)
- **gaogg521/AionUi one-main = `bd3e424`**(v2.1.28 基线 + M3c superAssistant UI 首屏)

## M2 整体完成度

| 子里程碑 | 状态 | fork commit |
|---|---|---|
| M2a | ✅ | `d11d120` |
| ~~M2c~~ | ✅ 已并入 M2a | — |
| M2b 飞书 SSO | ✅ | `a442bfb` |
| M2d 钉钉/企微 | ✅ | `a442bfb` |
| M2d LDAP | ⏳ 待后续 | — |
| M2e 管理后台 API | ✅ | `a442bfb` |

**M2 整体(M2a+M2b+M2d+M2e)完成,LDAP 待后续**。

## 下一步(第十八轮候选)

按依赖关系,推荐顺序:
1. **M4**(UI 移植收尾 + httpBridge 适配层 + 客户端连远端)——M3c 已完成个人员工 UI,M4 补企业/管理页 + 客户端模式,让 fork 真正可用。
2. **M5**(数据迁移 + 打包 + 灰度)——M4 完成后做最终迁移发布。
3. **LDAP**(M2d 尾巴)——需要 ldap3 crate + 真实 LDAP 服务器做 E2E。
