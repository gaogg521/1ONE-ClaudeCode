# v2 迁移接手快速入门（Handoff Quickstart）

> **接手 AI 直接读这一份就能干活。** 最后更新：2026-07-07 第二十一轮。
>
> 项目：1ONE ClaudeCode 把后端从 Node/Electron 迁移到 fork AionCore（Rust）+ 上游 v2 前端壳。用户已拍板"选项 A"：fork `gaogg521/AionCore` + `gaogg521/AionUi`，按 M0-M5 推进。

## 👉 接手续作（一句话，第二十三轮 2026-07-08）

**代码在 fork（`D:\aionui-m0\AionUi` one-main），纯前端，未 commit / 未打包。** 两件事 + 一个大方向：①「企业部署模式」卡片从**远程连接**页迁到**企业**页顶部（dev 已实测 ✅）；②新建**企业管理后台控制台首页**独立路由 `/enterprise/console`——老架构那套完整企业后台（`EnterpriseHome` + `pages/admin/*`）fork 没迁，现散落在超级助手页 + 企业页，本轮做统一宫格门户 + 精准深链（已有功能跳转，效能洞察/制品/代码库标「即将推出」）。改动 8 文件（WebuiModalContent / enterprise index / `EnterpriseConsole.tsx`🆕 / Router / superAssistant index / RegistriesTab / zh+en common.json），tsc/lint/i18n 全过。**详细记录见 `AionUi/docs/guides/session-2026-07-08-enterprise-console.zh-CN.md`。**

**策略分发（用户点名的大工程核心，待做）**：超管在企业后台给接入企业的**成员机**下发 skills / MCP 等工具——fork 和老架构前端都没有此模块。**用户方针**：企业管理是大工程，每块做完**必自测**，重点**策略分发 + 用户登录**，老架构这两块有 BUG 别照抄。

**后续待办(详见 fork `docs/guides/session-2026-07-08-enterprise-console.zh-CN.md` §后续待办)**:①**⚠️ WebUI 浏览器后台**——用户 2026-07-08 新方向:企业「组织管理与平台配置」出于安全**须能在浏览器 WebUI 后台配置**;现状桌面 app 已可见控制台/企业入口,但**浏览器 WebUI 里看不见**,待查侧栏企业入口的 web gate + `/enterprise/console` 在 web 的可达性；②策略分发；③用户登录核查；④控制台动态自测收尾。提交约定:只 add 自己改的文件(**绝不 `git add -A`**,fork 有他人未提交改动)→ 中文 commit 无 AI 签名 → 出包前 bump 版本 + `dist:win`(不删旧 .exe)。

## 👉 接手续作（一句话，第二十二轮 2026-07-08）

**fork 里修三个 UI 问题（仅改源码、未打包，等用户重编实测）**：①CLI 助手「装了就显示」——可见性判据 online→online‖offline（`AionUi/packages/desktop/src/renderer/utils/model/assistantSelection.ts`）+ 后端 reconcile 过滤纳入 Offline（`AionCore/crates/aionui-assistant/src/service.rs`）；②1ONE CLI 猫图标——迁移 021 已就位、**无需改码**，重编后端即变猫；③企业登录渠道桌面端置灰/不跳转——`EnterpriseLoginChannelPanel.tsx` 的 SSO providers 相对 fetch 改用 `getBaseUrl()`。提交 AionUi `63957f3`+`88ba13b`、AionCore `8403b02`。**详细记录见 `AionUi/docs/guides/session-2026-07-08-assistant-branding.zh-CN.md` 第 7 节**；**可直接复制给下个会话的接手话术见 `docs/tech/v2-handoff-ui-fixes-prompt.md`**。待办：重编 + `dist:win` 出包（bump 版本、不删旧 .exe）→ 用户实测。

**Cursor 澄清**：app 接的是 Cursor Agent CLI（`agent`，装 `%LOCALAPPDATA%\cursor-agent\`，已在 PATH），非编辑器 `Cursor.exe`；「找不到」与安装目录无关，真因是旧逻辑只显示握手成功(online)的 CLI。

## 👉 接手续作（一句话，第二十一轮 2026-07-07）

**4 个任务全部完成并 push（fork one-main，2.1.31 已打包）：#23 记忆管理移植 / #24 客户端加入引导+超管 i18n / #15 ACP bug 静态分析 / #18 Team Mode 验证。已出安装包 `out/1ONE Code-2.1.31-win-x64.exe`（277MB，2.1.30 保留）。等用户实测反馈。**

**待用户输入**：
- **#15 ACP bug 复现定性**——需换支持 function-calling 的模型（GPT-4o / Claude 3.5 / Gemini 1.5 Pro / Qwen-Max / DeepSeek-Chat）在同 provider 下复现，确认是模型能力问题还是 fork bug。分析文档：`D:\aionui-m0\AionUi\docs\guides\acp-aioncli-tool-call-failure-analysis.md`，列了 5 个可能失败点 + 4 项防御性改进建议（等定性后再改）。
- **#18 Team Mode 运行时 E2E**——代码层验证通过（入口/IPC/后端全在），运行时 7 步清单在 `D:\aionui-m0\AionUi\docs\guides\team-mode-verification.md`；多用户场景卡 D5。
- **钉钉 / 企业微信 SSO**（T2，用户 2026-07-06 明确暂缓，等凭据）。
- **C 组跨用户活体 E2E**（T3，卡 D5 多用户环境）。

**本轮已完成并 push（fork one-main，2.1.31 已打包）**：
- **#23 移植记忆管理页**（`aa5241b`）：从老 1one-command 整块移植——IPC（`memory.*` 11 通道）+ `memoryBridge.ts`（`~/.claude/projects/{sanitized}/memory/*.md` + 全局/项目 CLAUDE.md）+ `pages/memory/index.tsx`（三 tab：自动记忆/全局/项目）+ 路由 `/memory` + 侧栏 `SiderMemoryEntry`（Brain 图标）+ i18n en-US/zh-CN。`suggestRoots` 改用 `ipcBridge.database.getUserConversations` 分页拉取（fork 无 IConversationRepository 实例）。
- **#24 客户端加入引导 + 超管 i18n 补全**（`2fb9bb7`）：OverviewTab 客户端模式（`isEnterpriseModeEnabled`）下加 Alert 提示"已连接到远端服务器？同样在下方输入邀请码即可加入"；en-US/zh-CN `common.json` 补全 `common.enterprise.*` 全部键（title/tab*/role*/join*/create*/exit*/remote* 等，之前全靠 defaultValue 兜底）。超管入口说明：fork 本就没有老系统独立 Web 管理后台，走 aioncore `/api/auth/status` + `/api/webui/reset-password` 首启自动生成密码，已在 WebUI 设置页生效。
- **#15 ACP bug 静态分析**（`757fbbb`）：`docs/guides/acp-aioncli-tool-call-failure-analysis.md`。按概率排序 5 个失败点：①模型不支持 function-calling（最高概率，`modelCapabilities.ts` 正则不识别 glm）②`max_tool_call_malformed/failure_turns` 默认 `Some(1)` 过严 ③`base_url` path 非空时未自动按 `is_full_url` 处理 ④session resume 孤儿 tool_call ⑤ACP 协议层关系小。
- **#18 Team Mode 验证**（`0b69b98`）：`docs/guides/team-mode-verification.md`。代码层验证通过——前端入口链路 / IPC 通道（CRUD+session+agent+messaging+run 控制+13 个 WS 事件）/ 后端 aionui-team crate（5 个 TEAM_CAPABLE_BACKENDS：claude/codex/gemini/aionrs/codebuddy + `team_spawn_agent`/`team_send_message`/`team_task_*` + 单测）。`#3363 missing field name` 已修。
- **bump 2.1.30 → 2.1.31**（`7a66d28`）+ **dist:win 出包** `1ONE Code-2.1.31-win-x64.exe`（277MB，2.1.30 保留）。

**前轮（第二十轮）已完成并 push（fork one-main，均需重打包才在安装版可见）**：
- 上游同步：AionUi 前端 merge `upstream/main` 到 2.1.29（`947aa20`，仅 3 冲突，tsc 通过）；AionCore 同步 v0.1.42（`9d16272`，tag `v0.1.42-one.1`）；bump 2.1.30 + aioncoreVersion（`6b4b27d`）
- 品牌：三层全修（壳层/i18n 571处/硬编码+logo）+ merge 带回的新串重刷（`947aa20`）
- 修复：超级助手协作看板员工下拉脱节（`fd7eb59`，后端 create→list 回环已验证）
- UI：未安装 CLI 助手默认隐藏（`7b258f9`）；企业入口部署模式徽标 单机/客户端/服务端（`f735a08`）；我的技能/MCP 提升为顶级侧栏入口（`7226b28`）
- 删除：桌面宠物整个子系统（`33f8aae`，tsc + electron-vite build 双验证）
- 打包脚本：不再删旧安装包（`7d1dc53`）；安装目录改 `1onecode`（`6686ffc`，NSIS 待打包验证）
- 澄清：企业后台/加入 fork 本就是精简/治理形态（老系统那套臃肿菜单从没迁入）；工作区=会话内面板、任务看板=超级助手协作看板、记忆管理=fork 确无（#23 移植）

## 一句话当前状态

**M0-M5 全部完成（M5 = 数据迁移 + 打包链 + 灰度约定，详见 `docs/tech/v2-m5-migration.md`）；遗留项清扫完成（LDAP / resetpass / Runtimes tab 已做掉）。剩余项全部依赖用户输入：渠道/OAuth/视觉 E2E 凭据、微信 iLink 决策、安装包品牌拍板、灰度执行。权威清单 v4 在 CONTEXT 第十九轮。**

## fork 仓库 + 工作目录

| 仓库 | 远端 | 本地工作目录 | 分支 | HEAD |
|---|---|---|---|---|
| AionCore fork | `gaogg521/AionCore` | `D:\aionui-m0\AionCore` | `one-main` | `6c398e6`（2026-07-06） |
| AionUi fork | `gaogg521/AionUi` | `D:\aionui-m0\AionUi` | `one-main` | `4c5ec67`（2026-07-06；rebrand 1ONE Code 含 i18n `317a327`；B1 后端源默认切 fork `4c5ec67`；工作区干净） |

⚠️ **`/d/AionUi` 是上游 iOfficeAI main，不是 fork**——别搞混。fork 在 `D:\aionui-m0\AionUi`。

cargo 在 `~/.cargo/bin`，bash 里要先 `export PATH="/c/Users/allenzhao/.cargo/bin:$PATH"`。

## 必读文档（按顺序，接手会话第一次读这 7 份就够）

1. **`CONTEXT.md` 第十九轮**（最底部）— M5 + 遗留项清扫记录、**权威未完成项清单 v4**、fork 现状
1.5 **`docs/tech/v2-m5-migration.md`** — M5 数据迁移/打包/灰度全记录（做灰度、迁移排障、LDAP/resetpass 细节先读这份）
2. **本文件**（你正在读的）— 快速入门
3. `docs/tech/v2-architecture-comparison.md` — 选项 A 决策文档（M0-M5 路线图）
4. `docs/tech/v2-m2-enterprise-crate-design.md` — M2 设计（M2 整体完成，进度头有 LDAP 待办清单）
5. `docs/tech/v2-m3-employee-design.md` — M3 设计（M3 整体完成，8 条关键实现事实）
6. `docs/tech/v2-m0-report.md` §3 — M5 数据映射表
7. Claude Code 自动记忆 `~/.claude/projects/D--1one-command/memory/upstream-alignment-roadmap.md` — 路线图摘要 + How to apply

## 编译 / 测试 / 冒烟命令

```bash
# 后端（AionCore fork，在 D:\aionui-m0\AionCore）
export PATH="/c/Users/allenzhao/.cargo/bin:$PATH"
cargo build -p aionui-app              # debug 增量 ~3min
cargo build -p aionui-app --release    # 增量 ~50s
cargo test -p one-sso -p one-org -p one-employee  # 29/29

# 启服务冒烟（--local 免认证）
./target/release/aioncore.exe --local --port 25912 \
  --data-dir /d/aionui-m0/m2-smoke \
  --log-dir /d/aionui-m0/m2-smoke/logs \
  --work-dir /d/aionui-m0/m2-smoke/work

# 前端（AionUi fork，在 D:\aionui-m0\AionUi）
bunx tsc --noEmit                      # typecheck
bunx oxlint <paths>                    # lint
bun run dev                            # 桌面 dev（Electron）
```

⚠️ **aioncore.exe 不接受 `start` 子命令**（那是 web 形态），直接 `aioncore.exe --local --port ...`。也没有 `--no-open`。

## 开发环境启动脚本（PowerShell，封装上面的命令）

`D:\aionui-m0\scripts\`（`aionui-m0` 非 git 仓库，脚本不污染两个 fork）。日常开发用这三个，比手敲命令省事。详见 `scripts/README.md`。

| 脚本 | 用途 | 何时用 |
|---|---|---|
| `frontend-dev.ps1` | 启动桌面 dev（Electron+React HMR），自动带后端 | **只改前端**时一条命令搞定 |
| `backend-rebuild.ps1` | 编译 AionCore + 内嵌进 AionUi bundled 目录（`-Dev` 编完直接起前端） | **改了后端源码后** |
| `backend-run.ps1` | 单独跑后端（`--local` 免认证），`-Rebuild`/`-Port` 可选 | 只想 curl 调 API |

**关键衔接**：`bun run dev` 自动 spawn 的是 `resources/bundled-aioncore/win32-x64/aioncore.exe`——**编译产物，不是 AionCore 源码实时代码**。改后端源码后必须先 `backend-rebuild.ps1`（= `cargo build --release` + `prepareAioncore.js` 搬运），前端才用得上。只改前端则后端不用碰。（上游是官方 CI 编后端发 release、AionUi 自动下载；fork 未建 CI，用本地编译 + `AIONUI_BACKEND_LOCAL_PATH` 手动替代——见 m5 文档 §2。）

## 已完成里程碑速查（详情按路由读，不要重做侦察）

- **M4 全部完成**：企业页（`f2b7031`）/ 登录 SSO 按钮（`adbfdb2`）/ 配对码兜底（`2526dc3`）/ 桌面连远端 + SSO 深链（`c6f65e3`+`9f79c45`+`3ef8778`）——详见 CONTEXT 第十八轮
- **M5 全部完成**：数据迁移（AionUi `1005524`，oneMigration/ 模块）+ 打包链（`2d5d1ff`，`AIONUI_BACKEND_LOCAL_PATH`/`AIONUI_BACKEND_REPO`）+ 灰度约定——**详见 `docs/tech/v2-m5-migration.md`**
- **遗留项清扫完成**（AionCore `1ede4f9`）：LDAP 密码登录（`POST /api/one/sso/ldap/login`）、resetpass CLI（`aioncore --data-dir <dir> resetpass`）、superAssistant Runtimes tab、CSRF e2e 对齐 M4d 契约
- **Issues/EnterpriseCollaboration 重建完成**（用户拍板；AionCore one-devops crate + AionUi 协作看板 tab）——详见 m5 文档 §5
- **二期主线全部完成**（2026-07-06，权威进展在 `v2-phase2-plan.md`）：A1 编排三层 L1/L2/L3（assign/breakdown/autopilot + 团队共享）、A2 RAG 向量管线、A3 注册表管理 UI、A4 milestones + test plans + CI 流水线、B2 自建 agent 迁移、B4 LDAP 管理 UI、B3 rebrand 1ONE Code 全部收官；**飞书 SSO + LDAP 域控真实 E2E 已通过**（见 memory `feishu-sso-e2e-verified.md`）

出包命令（fork 安装包）：

```bash
cd D:\aionui-m0\AionUi
AIONUI_BACKEND_LOCAL_PATH='D:\aionui-m0\AionCore\target\release\aioncore.exe' bun run dist:win
# 产物 out/AionUi-<version>-win-x64.exe
```

## 下一步任务（权威剩余清单在 `docs/tech/v2-phase2-plan.md` 接手状态段）

一期 + 二期主线均已收官（见上）。**剩余项按优先级**（详情读 `v2-phase2-plan.md`「剩余待办」）：

1. **重打包收尾**（明确动作）：B3 rebrand + A4 新域改动仅在源码、未出安装包。出包前先 bump `package.json` version、且**不删任何旧 .exe**（memory `feedback-build-artifacts`）；命令见上「出包命令」；顺带回归 rebrand 后 userData 路径与 one-import 源定位。
2. **钉钉 / 企业微信 SSO**：🅿️ **用户 2026-07-06 明确暂缓**（非漏做），等以后拿到真实凭据再完成、并回来更新文档。代码就绪，仅缺配置。redirectUri 模板 `http://192.168.11.137:25809/api/auth/{dingtalk|wecom}/callback`。
3. **C 组跨用户活体 E2E**：多用户企业组织下的 A1 L3 团队共享验证 + M4d OAuth 302 真跳转，⛔ 卡 D5 多用户环境。
4. **A4 value stream 域 / A1 L3 存量员工 tenant backfill / A2 RAG 三增强**：需求驱动或可选，非阻塞。

**完整二期计划（前置决策 D1-D5 + A/B/C 分组 + 三波次排期 + 逐项状态）见 `docs/tech/v2-phase2-plan.md`。**

## 关键约束（踩坑沉淀，不可再犯）

### 主进程 console.* 禁令（最高优先级）

`@office-ai/platform` patch 了 `console.*`，在主进程触发 `bridge.adapter.emit` → `win.webContents.send` × N + WebSocket 广播。在同步调用栈（IPC handler / Express 中间件）里用 console，阻塞 event loop → Windows "未响应"。

**规则**：`src/process/`、`src/index.ts`、`src/preload.ts`、`src/server.ts` 严禁 `console.*`，用 `appendFileSync`/异步 `appendFile` 写文件日志。`.oxlintrc.json` 已开 `no-console: warn`。**渲染进程的 console.log 是安全的**。

### 卡死终局（已解决，别回退）

- 调用栈落在 `electron.exe` 框架二进制 → 禁用 DIPS
- SQLite WAL 反复索引损坏 → 切 `journal_mode=DELETE`

### ConfigStorage 主进程调用永远不返回

`ConfigStorage.get()` 是渲染层专用 API，主进程内部调用要用 `ProcessConfig`。

### HttpOnly cookie 前端读不到

`one-session` cookie 设了 `httpOnly: true`，前端 `document.cookie` 读不到。判断登录态用 AuthContext 的 `status`，或让 WebSocket 总是尝试连接。

### fetch 必须有超时

所有 fetch 必须有 `AbortSignal.timeout()` 兜底，避免 loading 永久 true。

### httpBridge body 平铺

后端 axum `Json<UpdateEmployeeInput>` 接受**平铺 body**（`{name,description,...}`），不是 `{updates:{...}}` 包一层。httpBridge 的 `mapBody` 要平铺。M3c 踩过这个坑。

### AionUi fork 的 Arco 组件 prop 差异

- `Tabs.TabPane` 用 `title` 不是 `tab`
- `Modal` 无 `width` prop

### M2/M3 关键实现事实（已沉淀到设计文档进度头）

- `CronSchedule` 不派生 serde，可 serde 的是 `CronScheduleDto`（tag="kind"），存库用 Dto JSON + `schedule_from_dto` 转换
- 团队 run 用 `TeamSessionService::get_team` 拿 slot.conversation_id
- cron 扫描器触发后立即把 `next_run_at` 置 NULL 防重入
- OAuth state 存内存（`tokio::sync::Mutex`），单进程足够，多实例需共享存储
- desktop 模式 callback 不 Set-Cookie，用 `aionui://sso-callback?token=...` 深链
- JIT 建用户用随机密码
- WeCom 的 external_id 是 corp UserId
- `IUserRepository` 没有 `set_role`（上游 users 表无 role 列），RBAC 完全靠 `RequireOrgAdmin` extractor 读 `one_user_org`
- `AdminUserDto.last_login` 列名对齐上游（不是 `last_login_at`）
- `RequireOrgAdmin` 要求用户在 enterprise 里，`--local` 默认用户需先 `/org/create`

## 工作模式

- **永远在 main 分支开发提交**（1one-command 仓库），不建功能分支
- **commit 信息全部用中文**，格式 `<type>(<scope>): <subject>`，不加 AI 签名
- **打包前必须 bump package.json version patch+1 并 commit push**
- **打新包不许删旧 .exe 安装包**（一个都不行），其他中间产物随便删
- **测试走桌面端不走 WebUI**（`npm run restart`，WebUI PATH 不全导致 claude CLI not found）
- **改动影响运行行为（src/**）必须打新 Windows 安装包**（`npm run dist:win`），安装版只运行 app.asar 产物
- **使用中文交流**，代码仍用英文

## 接手 prompt 模板（给新会话用）

```
读 D:\1one-command\docs\tech\v2-handoff-quickstart.md，然后读 CONTEXT.md 第十九轮
（权威清单 v4）。M0-M5 已全部完成，剩余项都依赖我的输入——先把「下一步任务」四类
待办列给我确认（渠道/LDAP E2E 凭据、视觉 E2E、横切决策、灰度执行），我拍板后开工。
涉及数据迁移或打包细节先读 docs/tech/v2-m5-migration.md。
```
