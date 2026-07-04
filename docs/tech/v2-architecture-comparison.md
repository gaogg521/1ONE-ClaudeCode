# v2 架构对齐《对比清单》— 迁移决策文档

> 2026-07-04 产出。依据 CONTEXT.md「架构对齐总体规划」的硬性要求：真正大改前先产出详细对比清单交用户决策。
> 调研方法：三路并行——① AionCore（Rust 后端）源码浅克隆逐 crate 核查；② AionUi v2 monorepo + 关键 PR（#2672/#2668/#2677/#2682/#2897/#3018/#3423/#3250 等）；③ 本 fork 四大二开资产逐文件盘点（行数为 wc -l 实测）。
> 本文档只做评估，不含代码改动。决策权在用户。

---

## 0. 结论速览（TL;DR）

**推荐：选项 A（整体采纳上游 v2 架构），分 6 个里程碑执行，企业版以"自有 Rust crate"方式承载（A1）。**

三个决定性事实：

1. **渠道资产上游已经替我们写好了**。AionCore 的 `aionui-channel` 内置飞书（WS 长连接）/微信（官方 iLink Bot API）/钉钉（Stream+AI Card）/Telegram（长轮询）四个 Rust 插件，含 **6 位配对码授权、per-chat 会话隔离、流式 edit_message 回写**——与本 fork 的渠道架构几乎逐点同构（同源演化）。四大二开资产里最大的一块（42 文件 / 1.2 万行）在选项 A 下**基本白送**。
2. **数字员工所需的程序化 API 在 v2 后端全部现成**（POST conversations / POST messages 返回 turn_id / WS `message.stream`+`turn.completed` / cron 执行目标就是"向会话发消息"）。数字员工的主进程逻辑本来就薄（约 1000 行编排代码），改写为 HTTP API 调用即可。
3. **企业版（SSO/多租户/RBAC/管理后台）是唯一"上游完全没有、必须自己写"的后端域**。AionCore 的 auth 只有本地账号 + JWT + QR 登录，无 OAuth/SSO、无租户、无角色。这是选项 A 的主要成本所在（约 6–10 人周 Rust）。

一个重要的**预判修正**：CONTEXT.md 预评估假设"extension 机制或可承载渠道/企业逻辑"——**实测不成立**。`aionui-extension` 是 manifest 声明式的贡献模型，`channel_plugins` 贡献是 metadata-only 空壳（JS 入口从不执行），第三方**无法**通过扩展注入 HTTP 路由或后台服务。因此选项 A 必然意味着 **fork AionCore 并新增自有 crate**（Apache-2.0 无授权障碍；workspace 分层清晰，加 crate + router merge 一行即可挂路由，难度低-中）。

---

## 1. 关键事实清单（相对 CONTEXT.md 预评估的确认与修正）

| # | 事实 | 对决策的影响 |
|---|---|---|
| 1 | AionCore 公开、Apache-2.0（注意：LICENSE 文件是 Apache-2.0，但 Cargo.toml workspace.package 写 MIT，两处不一致；两者都允许 fork 商用） | ✅ 确认可 fork |
| 2 | 21 个 crate 四层架构（基础/能力/领域/组装），Axum+Tokio+sqlx/SQLite；agent 内核在另一个公开仓库 iOfficeAI/aionrs（git tag 锁定） | fork 要同时跟两个仓库的版本 |
| 3 | **extension 机制不能承载渠道/企业逻辑**（贡献类型封闭集合；channel_plugins metadata-only；无法注入路由/后台服务） | ❌ 修正预判：二开必须走"fork + 自有 crate" |
| 4 | `aionui-channel` 已内置飞书/微信/钉钉/Telegram，含 6 位配对码 + 会话隔离 + 流式回写；缺企业微信（WeCom）；Slack/Discord 只有枚举占位 | ✅ 渠道资产基本白送 |
| 5 | `aionui-auth` 无 SSO/OAuth 登录、无多租户、无 RBAC；users 表结构支持多用户但无注册路由 | ❌ 企业版后端必须自写（Rust） |
| 6 | 会话/消息/确认/cron 的 HTTP+WS API 齐备，数字员工三件套（建会话/发消息/收结果）现成；无 OpenAPI，契约以 `aionui-api-types` 为唯一真源 | ✅ 数字员工可薄改 |
| 7 | v2 前端 = `packages/desktop`（Electron 薄壳：主进程仅 66 个 ts 文件，无 agent/team/cron/MCP；**renderer 968 个文件全量保留**）+ `web-host`（无 Electron 宿主）+ `web-cli` | 迁移是"换心脏保皮肤"，UI 大盘可保 |
| 8 | 上游迁移杠杆点：`httpBridge.ts` 做成与 `bridge.buildProvider/buildEmitter` **同形状**的适配层，renderer 调用点几乎不改 | 我们可以照抄这个模式 |
| 9 | 数据迁移有现成教材：#2897（幂等迁移步骤）、#3018（完成标志防重放）、#3423（旧 DB 修复到 handoff 契约后整库移交后端） | 迁移风险可控 |
| 10 | AionCore schema 与本 fork 的 conversations/messages 语义高度相近（type/extra/status/position 同风格，同源演化） | 数据映射是低风险项 |
| 11 | 上游节奏：AionCore 近乎日更（20 天 18 个 release），贡献者约 10 人全为内部团队，外部 PR 合并通道未经验证 | fork 的 rebase 摩擦是最大战略风险 |
| 12 | 上游 team 模式仍在密集修 bug（6–7 月每周都有 fix） | "上游更稳定"在 team 域要打折扣，但他们日更修复 vs 我们停滞 |
| 13 | 桌面模式后端生命周期：`--parent-pid` 父死自杀 + `AIONCORE_LISTENING` 就绪信号 + `/health` 轮询；打包经 electron-builder `extraResources` 带 `bundled-aioncore`（自带 bun runtime），版本 pin 在根 package.json `aioncoreVersion` | 启动编排/打包相对机械 |
| 14 | 上游远程访问：桌面内置 WebUI 开关（QR 登录/初始密码）+ Electron headless 部署 + **`aionui-web` 纯 web 无 Electron 部署包**；未发现 Cloudflare tunnel/一键公网 | 我们的"服务端形式"上游已有对应物且更彻底 |

---

## 2. 五能力域对比（现状 → 上游 v2 → 差距 → 迁移后收益）

### 2.1 Agent 协作（team）

| | 内容 |
|---|---|
| 现状 | `src/process/team/` 18 文件 3716 行：TeamSessionService/TeammateManager/TeamMcpServer（import electron）/Mailbox/TaskManager，跑在 **Electron 主进程**；依赖 WorkerTaskManager fork worker。v1.9.11–1.9.15 的十余个可靠性修复未移植（Phase 3 待办） |
| 上游 v2 | 业务全在后端 `aionui-team` + `aionui-team-prompts` crate（任务板/mailbox/调度）；前端只剩纯 UI。近期仍在密集修 bug（#3309 稳定化、#3480 stale run state、#3501 能力透传等） |
| 差距与不稳定点 | fork 的 team 顽疾（leader 崩溃移除、流式期间 DB refresh 风暴、排队消息回滚丢失、300s 超时）全部源于"手工进程管理 + 主进程事件循环"；Phase 3 即使全部移植也只是追平 v1.9.15 |
| 迁移后收益 | 该域的修复从"我们逐个 cherry-pick"变成"跟着 aioncoreVersion 升级白拿"；tokio 统一管理子进程，worker 孤儿/竞态类 bug 结构性消失 |

### 2.2 内置助手

| | 内容 |
|---|---|
| 现状 | assistantPresets 硬编码 + **首条消息文本注入**（[LOAD_SKILL] 文本协议，已确认脆弱是主因，2026-07-04 三轮修补 + 每 20 轮重注入兜底） |
| 上游 v2 | 后端 `aionui-assistant` crate（builtin+user+extension 三源合并）；技能注入在后端（#2668），`extra.skills` 快照为渲染权威（#2677），**symlink 契约**直接进 CLI 原生 skills 目录（#2682）；完整助手治理页 + Butler「用对话来做」全场景入口（#3446） |
| 差距与不稳定点 | 我们的注入链是"前端拼 prompt 文本"，agent 不遵守/上下文挤出后失效；上游已根治（原生 skills 目录 + 后端注入） |
| 迁移后收益 | [LOAD_SKILL] 脆弱协议整体废弃；助手/技能行为与上游官网演示一致；Butler（应用管家，Phase 4b 待办）上游已内置，不用自己做 |

### 2.3 远程控制

| | 内容 |
|---|---|
| 现状 | Express-in-Electron（64 文件 1.33 万行）跑在**主进程**：JWT+HttpOnly cookie、WS 桥接 IPC、双端口管理员监听、企业 C/S 请求路由（webuiApiBase 479 行 origin 候选/回环 fallback）。历史顽疾：主进程 console 冻死、IPC 无超时转圈、静态资源代理顺序坑 |
| 上游 v2 | `web-host` 独立进程（静态资源 + 反代 /api + /ws upgrade）+ 后端 aionui-auth（JWT/CSRF/QR 登录/限流）；另有 `aionui-web` 纯 web 部署包（服务器上无需 Electron/xvfb）+ Docker |
| 差距与不稳定点 | 我们把 web 服务塞在 UI 进程里，这是 4 轮卡死排查的结构根因；"Electron headless + xvfb 当服务器"是别扭形态 |
| 迁移后收益 | web 服务与 UI 事件循环彻底解耦（该类卡死结构性消失）；获得真正的服务器部署形态（tarball/Docker）；QR 登录/初始密码等体验白拿 |

### 2.4 自动化（cron / 数字员工）

| | 内容 |
|---|---|
| 现状 | croner-in-主进程（13 文件 2778 行，含 powerSaveBlocker 依赖）；表达式解析 bug 刚修（#2320 移植）、无效表达式击穿 init 刚修（#2231 同类）；数字员工 566+416 行编排 + 6553 行 UI，深度依赖 WorkerTaskManager/ConversationService/cronBusyGuard 三件套 |
| 上游 v2 | `aionui-cron` crate：At/Every/Cron(带时区) 三种调度、执行目标就是"向会话发消息"（Existing/NewConversation 两种模式）、agent 可经 cron-helper 子命令自建任务、时区修复已内置（#3056） |
| 差距与不稳定点 | 我们的 cron 修复是"上游修过的坑再修一遍"；数字员工的可靠性受制于主进程整体稳定性 |
| 迁移后收益 | cron 域缩为纯 UI；数字员工改为编排 HTTP API（接口面更窄更稳），且获得"agent 自建定时任务"能力 |

### 2.5 基础设施（IPC / DB / 进程模型）

| | 内容 |
|---|---|
| 现状 | ipcBridge 1663 行双向 RPC 抽象（Electron IPC 与 WS 两种 adapter）；better-sqlite3 在主进程（DIPS+WAL 损坏史，已切 DELETE journal）；ConfigStorage 主进程调用永不返回的坑；worker fork 手工管理 |
| 上游 v2 | HTTP `/api/*`（snake_case，#2672）+ 单一 `/ws` 事件总线 `{event,payload}`；sqlx/SQLite 在后端进程；`aionui-runtime` 统一子进程/bun 管理；`httpBridge.ts` 同形状适配让 renderer 无感切换 |
| 差距与不稳定点 | CONTEXT.md 已归因：历史卡死几乎全部源于"重活压在主进程"（console patch 广播、同步 IO 微任务、DB 同进程互扰、双向 IPC 语义脆弱） |
| 迁移后收益 | 六大类历史顽疾（console 冻死/DIPS+SQLite/ConfigStorage 挂起/IPC 无超时/worker 竞态/Defender 首扫）**全部结构性消失**（对照表见 CONTEXT.md「不稳定性的架构归因」节） |

---

## 3. 三个策略选项

### 选项 A｜整体采纳上游 v2（fork AionCore + 换上游前端壳，推荐）

**内容**：fork AionCore（Apache-2.0），企业版逻辑以自有 crate 承载；前端换上游 `packages/desktop` + `web-host`，把本 fork 的 UI 二开（企业/管理后台/数字员工页面）叠回 renderer；数据按上游 handoff 契约迁移。

**四大二开资产去向**：

| 资产 | 去向 | 说明 |
|---|---|---|
| WebUI server（1.33 万行） | **绝大部分废弃** | web-host + aionui-auth 取代；仅企业相关路由逻辑（见下）保留价值 |
| 企业版 C/S（auth 4.2k + adminRoutes 1.4k + renderer 8.8k 行） | **后端重写为 Rust 自有 crate**（`aionui-sso`/`aionui-org`：飞书/钉钉/企微/LDAP SSO+JIT、租户表、RBAC、管理后台路由）；渲染层页面移植重接线 | 唯一必须新写的后端域。现有 TS 实现是完整的逻辑规格书（SSO provider 是纯 HTTP 调用，翻译成本 < 从零设计） |
| 渠道（1.22 万行） | **基本废弃换用上游**（飞书/微信/钉钉/Telegram 上游已内置且同构） | 需补：手动输入配对码兜底 UI（交付约定）；微信插件差异核对（我们对接外部本地服务轮询，上游用官方 iLink Bot——行为差异需验证）；WeCom 双方都没有 |
| 数字员工（主进程 ~1k + UI 6.5k 行） | **编排逻辑改写为 HTTP API 调用**（Rust crate 或前端 service 均可，推荐后端 crate 以支持 headless）；UI 移植 | API 三件套现成，是四大资产里迁移最顺的 |

**工作量（单人熟手，Rust 需边学边写则取区间上限）**：

| 里程碑 | 内容 | 人周 |
|---|---|---|
| M0 | 上游 v2 原版跑通（桌面 + aionui-web 服务器形态），本地数据只读验证，确立 fork 分支策略（pin aioncoreVersion） | 1–2 |
| M1 | 渠道对齐：上游四渠道实测 + 配对码兜底 UI 补齐 + 微信链路差异核对 | 1–2 |
| M2 | 企业版后端：fork AionCore 加 `aionui-sso`/`aionui-org` crate（SSO/JIT/租户/RBAC/管理后台 API），diff 面收敛在自有 crate + router 挂载点 | 6–10 |
| M3 | 数字员工：编排逻辑 API 化 + superAssistant UI 移植 | 4–6 |
| M4 | UI 二开移植：企业/管理后台页面重接线（fetchWebuiApi → httpBridge）、i18n/主题合并 | 3–5 |
| M5 | 数据迁移（照抄 #2897/#3018/#3423 模式：幂等步骤 + 完成标志 + DB handoff）+ 打包链（bundled-aioncore + 自有 bundled 资源对表）+ 灰度切换 | 2–3 |
| **合计** | | **17–28 人周** |

**风险**：
1. **上游节奏**（最大）：AionCore 日更 + aionrs 另库锁 tag。缓解：像上游一样 pin `aioncoreVersion` 定期批量升级，而不是追 HEAD；二开严格收敛在自有 crate，对上游文件 diff 最小化；migrations 不可变检查天然保护我们的新表。
2. **Rust 能力**：M2 是 Rust 深水区。缓解：AionCore 每个领域 crate 都是"routes+service+state"统一模式，有 21 个现成范本可抄；现有 TS 企业实现是完整规格。
3. **上游 team 域自身还在修 bug**：迁过去不等于立刻稳，但修复速度（日更）远快于我们 cherry-pick。
4. **外部 PR 通道未验证**：不能指望把二开 upstream 化，按长期 fork 规划。

**回滚方案**：里程碑制，M0–M4 期间旧 Electron 版本继续作为生产版本发 patch（当前 7 轮修复正是过渡期保障）；M5 的 DB handoff 前强制镜像备份（上游 #3423 模式自带修复/回退路径）；灰度期双版本并行，出现阻塞性问题回退安装包即可（旧 DB 未被破坏性改写）。

### 选项 B｜混合架构（保 TS 栈，自建 Node 后端进程）

**内容**：不换上游，把现有 webserver + WorkerTaskManager + DB + cron + channels + team 从主进程抽到独立 Node 子进程（headless），Electron 主进程只剩窗口管理，renderer 经 WS/HTTP 连接（browser.ts 适配层已证明可行——WebUI 浏览器模式本来就是全 WS 运行的）。

**资产去向**：四大资产全部保留原实现（TS），只挪进程。盘点显示 WebUI server ~80% 可移植、渠道/企业服务端可移植度极高，真正要动的是"谁来启动"+ bridge provider 里的 Electron API 调用逐个甄别。

**工作量**：进程抽离 + provider 甄别 + 生命周期管理 6–12 人周；**但** agent 运行时的协议层缺陷（Phase 2 的 ACP 2.0）、team 修复批次（Phase 3）仍要另做 4–6 人周。合计 **10–18 人周**。

**风险**：自建协议与进程管理长期只有我们自己维护；上游 v2 功能（助手治理/Butler/symlink 契约/新渠道）永远追不上，与上游渐行渐远变成"永久分叉"；主进程顽疾消除但 agent 运行时 bug 类仍靠自己修。

**回滚方案**：最好——可按模块灰度（feature flag 决定某服务跑 in-process 还是子进程），任一模块出问题切回主进程模式。

### 选项 C｜渐进修补（原 Phase 2/3/4 路线）

**内容**：不动架构，按既定计划移植 ACP 协议层（Phase 2）、team 修复批次（Phase 3）、分页/Butler 自研（Phase 4）。

**工作量**：Phase 2 约 3–4 + Phase 3 约 2–3 + Phase 4 约 3–4 ≈ **8–11 人周**。

**风险**：架构性顽疾只能逐个打补丁（每类新坑都要再来一轮"4 轮排查"式的代价）；上游 v1.9.x 修复金矿挖完后，v2.x 的修复大部分不可移植，**维护成本随时间发散**；用户点名的四个不稳定域（协作/助手/远程/自动化）中，助手注入链和远程控制的结构缺陷无法根治。

**回滚方案**：每个移植 PR 独立可回滚（现行模式）。

### 三选项横向对比

| 维度 | A 整体采纳 | B 混合架构 | C 渐进修补 |
|---|---|---|---|
| 六类历史顽疾 | ✅ 全部结构性消失 | ✅ 主进程类消失，agent 运行时类靠自修 | ❌ 逐个打补丁 |
| 四个不稳定域对齐上游 | ✅ 全对齐且持续白拿修复 | ❌ 永久分叉 | ❌ 只能追 v1.9.x |
| 渠道资产 | 白送（上游已内置） | 保留自维护 | 保留自维护 |
| 企业版 | 需 Rust 重写（6–10 人周） | 保留 | 保留 |
| 工作量 | 17–28 人周 | 10–18 人周 | 8–11 人周 |
| 长期维护面 | 自有 crate + UI 二开（最小） | 全栈自维护（最大） | 全栈自维护 + 补丁债 |
| 回滚难度 | 中（里程碑制） | 低 | 低 |

---

## 4. 推荐与分期计划

**推荐选项 A**，理由链：

1. 用户点名的四个域（Agent 协作、内置助手、远程控制、自动化）在 A 下全部对齐上游且此后修复白拿；B/C 只能解决其中一部分且维护面更大。
2. 成本结构比预想好：最大二开资产（渠道 1.2 万行）上游已内置同构实现，数字员工 API 现成，UI 大盘（renderer）同栈可保留——真正要新写的只有企业版后端一块。
3. 17–28 人周换来的是维护面从"整个 Electron 后端"缩到"自有 crate + UI 页面"，这是一次性成本换持续性收益；C 的 8–11 人周之后维护成本仍在发散。
4. 历史证据链（CONTEXT.md 归因表）表明：不迁移，主进程类顽疾还会以新形态复发。

**若 M2 的 Rust 工作量在实操中超预期**，有一个降级路径可以中途切换：企业版暂以"Node sidecar"承载（现有 Express auth/admin 代码抽成独立 Node 服务，与 aioncore 并行部署，反代整合）——可省 3–5 人周，代价是双服务运维复杂度。建议 M2 开工两周后做一次 checkpoint 再定。

**执行顺序**：M0（1–2 周内可见结论）→ M1 → M2（含两周 checkpoint）→ M3 → M4 → M5 灰度。每个 M 是独立会话 + 独立可回滚里程碑，完成后更新 CONTEXT.md。

**无论选哪条路**：当前工作区 7 轮未提交改动应先 commit（它们是过渡期生产版本的稳定性保障），再开 M0。

---

## 5. CONTEXT.md 六个验证问题的答案

1. **extension 机制能否承载渠道/企业？** 不能。贡献类型封闭集合，channel_plugins metadata-only（JS 入口不执行），不能注入路由/后台服务。必须 fork 加 crate。
2. **aionui-channel 支持哪些渠道？** Telegram（长轮询）/飞书（WS 长连接）/钉钉（Stream+AI Card）/微信（官方 iLink Bot + QR 扫码 SSE）；6 位配对码 + (user_id, chat_id) 会话隔离，与 fork 同构。无企业微信；Slack/Discord 仅枚举占位。
3. **企业 C/S 语义在 aionui-auth 上如何映射？** 映射不了——auth 只有本地账号/JWT/CSRF/QR/限流，无 SSO/租户/RBAC。需自有 crate 补齐；`--local` 模式对应我们的"桌面免登录"，多用户表结构已在。
4. **数字员工依赖的 API 是否齐备？** 齐备：POST /api/conversations、POST /{id}/messages（返回 msg_id/turn_id）、WS message.stream/turn.completed、confirmations API、cron 执行目标即"向会话发消息"（Existing/NewConversation）、agent 可经 cron-helper 自建任务。缺 OpenAPI，按 aionui-api-types 手工对表。
5. **数据迁移映射？** AionCore 的 conversations/messages 与我们同源同风格（type/extra/status/position），低风险；模式照抄上游三 PR：幂等迁移步骤 + `*Migrated_v1` 完成标志 + 旧 DB 修复到 handoff 契约后整库移交。我们自己的增量表（企业/渠道/数字员工/DevOps 全家桶）随自有 crate 走新增 migration 文件（上游 migration 不可变检查反而保护我们）。
6. **构建链如何重排？** electron-builder `extraResources` 带 `bundled-aioncore`（自带 bun runtime），版本 pin 在 package.json `aioncoreVersion` + prepareAioncore.js 构建期下载；v1 的 worker 入口 asarUnpack 全部消失，仅剩原生模块 + 2 个内置 MCP 脚本。我们的 bundled-aionrs/agent-toolkit/内置 MCP 三件套需按此模式重排（多数随后端走，从前端打包链中消失）。

---

## 6. 附：调研证据索引

- AionCore 源码浅克隆核查（21 crate、extension resolver、channel plugins、auth 边界、cron 类型、API 路由、migrations 001–018、CLI 参数）——临时克隆已完成使命，可随时重建（`git clone --depth 1 https://github.com/iOfficeAI/AionCore`，仓库自带高质量 `ARCHITECTURE.zh-CN.md`）
- AionUi v2：packages 结构、httpBridge.ts 适配模式、backend-launcher.ts、electron-builder.yml、PR #2672/#2668/#2677/#2682/#2897/#3018/#3423/#3250/#3446/#3056、release v2.1.28 资产清单
- 本 fork 盘点：src/process/webserver（64 文件 13,310 行）、企业 auth 子树（约 4,213 行）+ adminRoutes（1,370 行）+ 企业/管理后台 renderer（约 8,800 行）、src/process/channels（42 文件 12,198 行，自带 ARCHITECTURE.md 625 行）、digitalEmployee（982 行 + superAssistant UI 6,553 行）、team（18 文件 3,716 行）、cron（13 文件 2,778 行）、schema.ts v53 + migrations.ts 2,242 行
