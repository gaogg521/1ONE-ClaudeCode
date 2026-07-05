# v2 迁移接手快速入门（Handoff Quickstart）

> **接手 AI 直接读这一份就能干活。** 最后更新：2026-07-05 第十八轮。
>
> 项目：1ONE ClaudeCode 把后端从 Node/Electron 迁移到 fork AionCore（Rust）+ 上游 v2 前端壳。用户已拍板"选项 A"：fork `gaogg521/AionCore` + `gaogg521/AionUi`，按 M0-M5 推进。

## 一句话当前状态

**M2 + M3 整体完成；M4a（企业页 /enterprise 六 tab + oneOrg/oneAdmin httpBridge 域）+ M4b（登录页 SSO 按钮）已完成。剩 M4c（配对码兜底组件）/ M4d（客户端连远端）/ superAssistant 剩余面板 / M5 / LDAP / M1-3 渠道 E2E。**

## fork 仓库 + 工作目录

| 仓库 | 远端 | 本地工作目录 | 分支 | HEAD |
|---|---|---|---|---|
| AionCore fork | `gaogg521/AionCore` | `D:\aionui-m0\AionCore` | `one-main` | `a442bfb` |
| AionUi fork | `gaogg521/AionUi` | `D:\aionui-m0\AionUi` | `one-main` | `adbfdb2` |

⚠️ **`/d/AionUi` 是上游 iOfficeAI main，不是 fork**——别搞混。fork 在 `D:\aionui-m0\AionUi`。

cargo 在 `~/.cargo/bin`，bash 里要先 `export PATH="/c/Users/allenzhao/.cargo/bin:$PATH"`。

## 必读文档（按顺序，接手会话第一次读这 7 份就够）

1. **`CONTEXT.md` 第十七轮**（最底部）— 当前状态 + 权威未完成项清单 v3 + fork 现状 + 编译命令
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

## 下一步任务（按优先级）

### 1. M4：UI 移植收尾 + httpBridge 适配层 + 客户端连远端

**M4a 已完成**（AionUi `f2b7031`）：企业页 `pages/enterprise/`（概览 join/create/exit + 成员/邀请码/审计/运行时/SSO 设置五个管理 tab）+ ipcBridge `oneOrg`/`oneAdmin` 两个 httpBridge 域 + `/enterprise` 路由 + Sider 入口。管理 tab 用 `/api/one/org/context` 的 role 门禁（AuthContext 无 role）。

**M4b 已完成**（AionUi `adbfdb2`）：登录页 SSO 按钮 `pages/login/components/LoginSsoButtons.tsx`——拉 `/api/one/sso/providers` 过滤 enabled+configured，同窗口跳 authorize（callback Set-Cookie 回跳 /#/guid）；desktop runtime 渲染 null。⚠️ 视觉 E2E 未做（需重建 renderer bundle + 浏览器打开 WebUI login 页），tsc/oxlint/端点形状已验。

M4 剩余：

- **M4c 配对码手动兜底组件**：上游缺口，5 个 ConfigForm 共享组件（飞书/钉钉/微信/TG/邮件）。先侦察上游渠道 ConfigForm 位置（搜 `packages/desktop/src/renderer` 里 feishu/telegram 的配对 UI），做一个共享的「输入 6 位配对码 → Approve/Reject」组件插进 5 个表单
- **M4d 桌面客户端连远端**：httpBridge baseUrl 支持指向 `enterpriseServerUrl`，桌面加"企业模式"开关；深链挂点已有（`process/utils/deepLink.ts` 的 aionui:// handler + `ipcBridge.deepLink.received` + `useDeepLink`），缺 token→session 换取机制。**桌面 runtime 目前完全跳过认证**（AuthContext `isDesktopRuntime → authenticated`），连远端时要引入真实认证——这是 M4d 最大的设计点
- **superAssistant 剩余面板**：Runtimes / Issues / EnterpriseCollaboration（Runtimes 可复用 oneAdmin.listRuntimeNodes）

**入口**：`D:\aionui-m0\AionUi\packages\desktop\src\renderer\`，参考 M3c superAssistant 与 M4a enterprise 的实现模式。

### 2. M5：数据迁移 + 打包 + 灰度

- 数据映射表在 `docs/tech/v2-m0-report.md` §3
- 照抄上游 #2897/#3018/#3423 三个迁移 PR 的模式
- 打包：`npm run dist:win`（打包前必须 bump package.json version patch+1）

### 3. LDAP（M2d 尾巴）

- 加 `ldap3` workspace dep
- 实现 `LdapProvider::authenticate(config, username, password) -> LdapAuthSuccess`
- 加 `POST /api/one/sso/ldap/login` 路由（非 OAuth，密码直登）
- JIT 复用 `resolve_or_provision_user`（LDAP external_id = directory objectGUID）
- 1one `src/process/webserver/auth/providers/LdapAuthProvider.ts`（525 行）作规格书

### 4. M1-3 渠道真实配对 E2E

需要用户提供飞书/钉钉/TG/微信凭据，必做。测试实例重启命令见 CONTEXT.md 第十二轮。

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
读 D:\1one-command\docs\tech\v2-handoff-quickstart.md，然后读 CONTEXT.md 第十七轮，
开始做 M4（UI 移植收尾 + httpBridge 适配层 + 客户端连远端）。先做侦察：看 AionUi fork
的 D:\aionui-m0\AionUi\packages\desktop\src\renderer\ 现有结构，确定 M4 第一步切多大。
```
