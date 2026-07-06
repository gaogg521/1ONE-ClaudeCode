# v2 迁移接手快速入门（Handoff Quickstart）

> **接手 AI 直接读这一份就能干活。** 最后更新：2026-07-05 第十九轮。
>
> 项目：1ONE ClaudeCode 把后端从 Node/Electron 迁移到 fork AionCore（Rust）+ 上游 v2 前端壳。用户已拍板"选项 A"：fork `gaogg521/AionCore` + `gaogg521/AionUi`，按 M0-M5 推进。

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
