# M0 里程碑报告 — 上游 v2 原版跑通 + 数据只读验证 + fork 策略

> 2026-07-04。选项 A 的第一个里程碑。工作目录 `D:\aionui-m0\`（与 fork 仓库、生产数据完全隔离）。

## 1. aionui-web 服务器形态（✅ 跑通）

- 产物：官方 release `aionui-web-2.1.28-win-x86_64.tar.gz`（sha256 校验一致），解压后为 `aionui-web.exe` + `bundled-aioncore/win32-x64/aioncore.exe`（73MB，v0.1.41）。
- 启动：`aionui-web.exe start --port 25908 --no-open --data-dir D:\aionui-m0\data --log-dir D:\aionui-m0\logs`。
  - aioncore 以 `--port 0`（动态端口）+ `--parent-pid` + `--local` 被 spawn，输出 `AIONCORE_LISTENING {"host":"127.0.0.1","port":<动态>}`，web-host 在 25908 反代 `/api` 与 `/ws`。
  - 冷启动 <2s：内置技能物化 123ms、DB 初始化 276ms、AgentRegistry 水合 21 个 agent（本机可用 4 个，含 Claude Code/Aion CLI，探测在启动时异步完成——上游 #2485 异步批量检测的效果）。
- API 冒烟（全部通过）：
  - `GET /api/auth/status` → `{needs_setup:false, user_count:1}`（--local 模式免认证）
  - `GET /api/assistants` → 助手列表，Claude Code `agent_status:"online"`
  - `POST /api/conversations`（type=acp, backend=claude）→ 创建成功，**`extra.skills` 快照自动写入**（#2677 机制验证）
  - `POST /api/conversations/{id}/messages` → 返回 `{msg_id, turn_id, runtime}`；agent 真实回复 `M0-SMOKE-OK`（thinking + text 两条消息落库）——**web-host → aioncore → 本机 claude CLI 全链路打通**
  - `GET /api/conversations/{id}/messages` → **自带游标分页**（oldest_cursor/newest_cursor/has_more_before）——原 Phase 4a 想自研的分页上游已内置
  - `DELETE /api/conversations/{id}` → 清理成功
- 观察：日志质量高（结构化 tracing，每个启动阶段有耗时），无本 fork 的"console 冻死"类结构风险。

## 2. 桌面形态（源码 dev 模式）

- 仓库：`D:\aionui-m0\AionUi`，checkout **v2.1.28 tag**（pin aioncoreVersion v0.1.41，与 web 包二进制一致——直接复制复用，无需二次下载）。
- `bun install`（3529 包 79s）→ `bun run dev`（electron-vite）。
- **✅ 最终跑通**：`AIONCORE_LISTENING port=58794` → `/health 200`（1 次探测、3.9s 就绪）→ 窗口 ready-to-show → renderer did-finish-load。agent 注册表探测出 Claude Code / OpenClaw / Aion CLI 可用。桌面 data-dir = `%APPDATA%\AionUi-Dev\aionui`（与本 fork 的 1OneClaudeCode-Dev 完全隔离）。
- 观察到的启动序列：main/preload 构建 → renderer dev server (5173) → Electron 窗口 → **legacy 迁移链现场执行**：`migrateLegacyData` → 旧 Electron DB 迁移 v22→v26 → `[Legacy DB] repaired handoff schema columns`（给 conversations 补 pinned/pinned_at 等——#3423 的 handoff 契约修复真实可见）→ spawn bundled aioncore。
- **dev 模式踩坑（记录）**：binaryResolver 只查 `process.resourcesPath/bundled-aioncore`（dev 下= `node_modules/electron/dist/resources/`）和系统 PATH，**不查仓库 `resources/`**——需把 `bundled-aioncore/win32-x64` 复制进 electron dist resources 才能 dev 启动（首次启动报 `aioncore startup failed while resolving backend binary` 即此因）。
- 结论：桌面形态 = "Electron 薄壳 + 同一个 aioncore"，与调研结论一致；迁移编排代码（runBackendMigrations/legacyHandoffContract）就是我们 M5 要照抄的模板。

## 3. 本地数据只读验证（✅ 低风险结论成立)

对 `1one.db`（副本，只读打开）与 AionCore `migrations/001_initial_schema.sql` 逐列对照：

**体量**：50 conversations / 600 messages / 1 user / 1 tenant；integrity_check ok；user_version 53；journal DELETE。企业 DevOps 全家桶表（rag/requirements/milestones 等）除 requirements(11)/audit_logs(11) 外全空——**本机迁移量极小**。

**messages 表：逐列一致**（id/conversation_id/msg_id/type/content(JSON)/position/status/hidden/created_at），CHECK 约束枚举也相同（position: left/right/center/pop；status: finish/pending/error/work）。本机消息 type 分布（tool_group 438、text 126、acp_tool_call 19、thinking 10…）需在 M5 验证渲染兼容（tool_group/acp_tool_call 是否为上游同名类型）。

**conversations 表**：
| 差异 | 处理 |
|---|---|
| fork 多 `tenant_id`/`team_id` 列 | tenant 并入企业 crate 自有 migration；team_id 上游放 extra/teams 表，M5 映射 |
| fork 少 `pinned`/`pinned_at` | 上游 handoff repair 自动补列（桌面 dev 已实测该行为） |
| type 分布 acp(4)/aionrs(43)/gemini(3) | 上游枚举完全兼容（Gemini 是只读 legacy variant，历史可读；新会话走 acp+backend=gemini——与 #2897 的迁移语义一致） |
| extra keys（workspace/backend/presetContext/enabledSkills/acpSessionId…） | 上游 extra 同风格；enabledSkills→`skills` 快照字段改名（#2677），M5 做一次 key 映射 |

**users 表**：fork 多 tenant_id/org_unit_path/org_profile_*/role（企业列）→ 全部随企业 crate 的自有 migration 走，不动上游表。

**结论**：数据迁移确认为**低风险项**。策略照抄上游：幂等步骤 + 完成标志 + handoff 修复后整库移交；我们的增量列/表在自有 crate migration 中补。

## 4. fork 分支策略（M0-4 决议）

1. **AionCore**：GitHub fork `iOfficeAI/AionCore` → 自有 fork 仓库；**不追 HEAD**，以 release tag 为基线（首基线 = 桌面 pin 的版本，如 v0.1.41/v0.1.42）。二开全部收敛在**新增 crate**（`aionui-org`/`aionui-sso` 等）+ `aionui-app` router 的最小挂载 diff。升级 = 定期 rebase 到新 tag（migrations 不可变检查保护自有新表）。
2. **AionUi 前端**：同样 fork + 以 release tag 为基线。UI 二开（企业/管理后台/superAssistant 页面）作为 renderer 内的独立页面模块叠加，尽量不改上游文件。
3. **版本 pin**：沿用上游 `package.json aioncoreVersion` 机制，指向**自有 fork 的 release**（fork 的 CI 构建产物），`AIONUI_BACKEND_VERSION`/`AIONUI_BACKEND_RUN_ID` env 可临时覆盖。
4. **1one-command 仓库**：保持为过渡期生产版本（继续发 patch），v2 线在新仓库/新目录推进，M5 灰度后切换。

## 5. 遗留/下一步（进 M1 前）

- [ ] 桌面形态最终确认后端 spawn + UI 手工体验一轮（窗口已起，见附录日志）
- [ ] 决定 fork 仓库归属（GitHub 账号/组织、公私有）→ 用户拍板后创建
- [ ] M1 开工：渠道对齐实测（飞书/微信/钉钉/Telegram 配对码全流程）+ 配对码手动输入兜底 UI 差距确认
