# M5 数据迁移 + 打包 + 灰度(设计与实施记录)

> 状态:2026-07-05 实施完成。M5a 数据迁移 + M5b 打包链完成并验证;M5c 灰度为流程约定(见 §3);同日完成 M0-M5 遗留项清扫(见 §4)。
> 相关提交:AionUi fork `1005524`(M5a)+ `2d5d1ff`(M5b env 扩展 + 运行时 tab);AionCore fork `1ede4f9`(LDAP + resetpass + CSRF 测试对齐)。

## 0. 结论速览

- **迁移方向**:1ONE ClaudeCode(`1one.db` + `one-config.txt`)→ v2(AionUi fork + AionCore)。
- **模式**:照抄上游 #2897/#3018/#3423——幂等步骤 + 完成标志(marker)+ DB handoff + 导入前镜像备份。
- **1one 原库只读不动**:导入读的是临时副本;回滚 = 继续用旧版 1ONE ClaudeCode,数据无损。
- **本机全量验证**:158 会话 / 2196 消息 / 4 种会话类型(aionrs/acp/gemini/openclaw-gateway)导入后 aioncore API 全部可读,置顶、model 归一化、acp_session 回填全部生效。

## 1. M5a 数据迁移

### 1.1 实现位置(AionUi fork)

```
packages/desktop/src/process/services/oneMigration/
  index.ts                  # runOneLegacyImport:marker/源定位/编排
  importOneLegacyDb.ts      # DB 导入 + 归一化
  importOneLegacyConfig.ts  # config 键白名单合并
```

挂点:`initStorage.ts` 第 6.5 步——在 `runLegacyDatabaseMigrations`(handoff 升级)之后、backend 启动之前执行,天然无写入竞争。失败不阻断启动,下次启动重试(INSERT OR IGNORE 保证重放安全)。

### 1.2 源与目标

- **源定位**:`AIONUI_ONE_IMPORT_DIR` 环境变量覆盖;默认 win=`%APPDATA%\1ONE ClaudeCode`、mac=`~/Library/Application Support/1ONE ClaudeCode`、linux=`~/.config/1ONE ClaudeCode`。以 `{root}/1one/1one.db` 存在为准。
- **目标自适应**(对齐 `maybe_copy_legacy_database` 的一次性拷贝语义):
  - `aionui-backend.db` 已存在(老 v2 用户)→ 直写 backend 库,并在导入事务内**复跑 aioncore 002 Part A/B/C(逐字)+ acp_session 回填**(002 是 sqlx 一次性 migration,不会再处理新导入的行;其语句全部键守卫幂等,复跑对存量行是 no-op);
  - 不存在(新装,灰度主路径)→ 写 `aionui.db`(先用 Electron 侧 initSchema + runMigrations 建到 v26 基线),backend 首启走常规 legacy handoff(拷贝 + 001-017 全跑)。
- **幂等锚点**:`{dataDir}/one-import.json` marker(含 counts/skipped/backup 路径),只在完整成功后写入。
- **备份**:目标库导入前镜像为 `*.pre-one-import.bak`。

### 1.3 导入集合与转换

| 表 | 处理 |
|---|---|
| conversations | 列映射导入;`status NULL→'pending'`(同 002);`source '1one'→'aionui'`(Rust 枚举无 '1one');`extra.pinned/pinnedAt` 提升为 `pinned/pinned_at` 列后从 extra 删除;`enabledSkills/excludeBuiltinSkills → enabled_skills/exclude_builtin_skills`(后端 legacy 别名);tenant_id/team_id 列丢弃(extra.teamId 由 002 语句补 team_id 键) |
| messages | 全列直拷(m0 §3 已证逐列一致);type 全集(tool_group/acp_tool_call/thinking/tips/agent_status/plan/cron_trigger)在 v2 MessageType 枚举内 |
| teams | 去 tenant_id;agents_version '1.0.0' 起步,由 002 Part C 归一化 slotId→snake_case(本机实测归一化到 1.0.1) |
| mailbox | 去 tenant_id;type 越界回落 'message' |
| cron_jobs | **按目标形态分支**:目标还有 `agent_type` 列(新装路径)→ 原样导入,013 assistant-first 迁移自行处理映射失败(置 disabled);目标已过 013(backend 路径)→ 导入即 `enabled=0` + last_error 提示重选助手 |
| acp_session | 回填(002 Part E);目标已过 013(无 agent_backend 列)→ 用 013 同款 agent_metadata 解析写 agent_id |
| 跳过 | tasks / team_memberships / tenants / personal_agents / auth_providers / requirements / audit_logs / assistant_plugins(1one 特有或 v2 已重构,量为个位数;记录在 marker.skippedTables) |

会话类型无需映射:fork AgentType 枚举已含 `acp/aionrs/gemini(legacy 只读)/openclaw-gateway/nanobot/remote`。

### 1.4 config 迁移

两侧文件编码相同(`base64(encodeURIComponent(JSON))`)。白名单键(语言/主题/缩放/CSS/工具/webui.desktop/acp 超时/`mcp.config`/`model.config`/5 渠道 assistant 键)合并进 fork 的 `aionui-config.txt`,**现值优先绝不覆盖**(空数组视为未设置);其后由 fork 既有 runBackendMigrations 管线(migrateConfigStorage/migrateProviders/migrateLegacyMcpConfigToDb/渠道助手)推进 backend。

两个关键点:
- 1one 内置 MCP(one-image-generation/one-web-tools/one-export-pdf 及 builtin 标记项)过滤掉——命令指向 1one 安装路径,fork 自举自己的内置;
- 导入了 `model.config` 时把 `migration.providersMigrated_v1` flag 重置为 false(该 flag 在 model.config 缺席时也会被 latch,不重置则 1one providers 永远进不去;replay 由 by-id 过滤兜底)。

**不迁**:acp.customAgents(15 条,v2 agent 体系不同构,待后续专项)、memory.*、system.*、webui.enterprise*(企业配置走 M4 企业页重建)、各类缓存与 migration flag。

### 1.5 验证记录(2026-07-05,本机真实数据)

- 单测:`tests/unit/bootstrap/oneLegacyConfigImport.test.ts` 8/8(编码/白名单/不覆盖/空数组/内置过滤/flag 重置)。
- backend 路径冒烟:fresh aioncore(25914)建库 → 导入脚本(与模块同 SQL)→ 重启 → `GET /api/conversations` 158 条全回、4 类型消息可读、pinned=龙虾游戏会话、`model` 归一化 `{provider_id,model,use_model}`、acp_session 回填 27 条、teams 归一化 1.0.1、无 camelCase 残留。
- 真实代码路径:`bun run dev` 桌面启动,`6.5. oneLegacyImport imported conversations=158,messages=2196,teams=1,mailbox=1,cron_jobs=1 target=aionui-backend.db +562ms`,marker/备份齐全;dev 应用 backend(60088)对外可读 158 条。

## 2. M5b 打包链

`prepare-aioncore.js` 新增两个 env(最小 diff,可回流上游):

- **`AIONUI_BACKEND_LOCAL_PATH`**:直接内嵌本地 cargo 产物(fork 开发/发版主路径)。manifest 记 `sourceType: local` + 源路径。
- **`AIONUI_BACKEND_REPO`**(owner/repo):release/artifact 下载源改指 fork 仓库(gaogg521/AionCore 起 CI 发 release 后启用)。

出包命令(Windows):

```bash
cd D:\aionui-m0\AionUi
AIONUI_BACKEND_LOCAL_PATH='D:\aionui-m0\AionCore\target\release\aioncore.exe' bun run dist:win
```

资源对表:managed-resources(node 运行时 + codex-acp/claude-agent-acp 适配器)由 aioncore 二进制自身 `prepare-managed-resources` 产出;内置技能在 fork 二进制 assets 内,运行时物化——用 fork 产物即自动携带我方资源,无需单独对表动作。

## 3. M5c 灰度切换(流程约定)

1. **并行安装**:v2 安装包 appId `com.aionui.app` / productName `AionUi`,与 1ONE ClaudeCode(不同 appId)并存安装、并存数据(`%APPDATA%\AionUi` vs `%APPDATA%\1ONE ClaudeCode`)。
2. **首启自动迁移**:v2 首次启动即完成 1one 数据导入(§1),旧库零改动。
3. **灰度期**:双版本并行使用;v2 出阻塞性问题 → 直接回到 1ONE ClaudeCode(数据从未离开)。v2 侧重导入:删 `one-import.json` + 还原 `*.pre-one-import.bak`(或清空 v2 数据目录重来)。
4. **切换完成判据**:核心链路(会话收发/渠道配对/企业登录)在 v2 稳定运行一个灰度周期后,1one-command 停发 patch,转维护模式。

## 4. M0-M5 遗留项清扫(2026-07-05 同日完成)

按用户指令,M5 完成后对 M0-M5 全部遗留项做了一轮核对与清扫:

| 遗留项 | 结果 |
|---|---|
| M2d LDAP provider | ✅ 完成(AionCore `1ede4f9`)。one-sso `providers/ldap.rs`(ldap3 0.11/rustls,服务绑定→搜索→用户绑定验密→UPN 回退)+ `POST /api/one/sso/ldap/login`(JIT + Set-Cookie + body token)+ `SSO_INVALID_CREDENTIALS`(401)。冒烟 5/5:无 provider 404 / upsert / 未达服务器超时 / configured=true / 空密码 401。**真实 AD/OpenLDAP 目录 E2E 待用户环境** |
| 横切 resetpass | ✅ 完成(同提交)。`aioncore --data-dir <dir> resetpass [--username X]` 直改库重置密码(`/api/webui/reset-password` 是 local-only,服务器实例此前无通路)。已验证:非 local 实例旧密码 401 → resetpass → 新密码登录拿 token |
| superAssistant Runtimes 面板 | ✅ 完成(AionUi `2d5d1ff`)。运行时 tab:员工/运行中/启用 MCP 计数 + 设置入口;企业成员显示组织节点卡片跳 /enterprise |
| superAssistant Issues / EnterpriseCollaboration 面板 | ✅ 用户拍板重建后当日完成(AionCore `368d7fd` + AionUi `46b88d4`,详见 §5) |
| M4d 附带修复 | ✅ aionui-app 两个 CSRF e2e 断言的是 M4d 之前行为(Bearer 也要 CSRF),M4d 后一直红;已对齐新契约(cookie 无 CSRF→403 保留,Bearer 豁免→200),11/11 过 |
| 微信 iLink vs bridge 决策、workflow scope→CI | ⚠️ 待用户决策(见 CONTEXT 第十/十一轮) |
| M1-3 渠道真实配对 E2E、M4b 视觉 E2E、M4d 真实 OAuth E2E | ⚠️ 等用户凭据/环境。另注:M4b 视觉 E2E 还需 aioncore 内嵌 web 资产从 fork renderer 重建(浏览器 WebUI 用的是二进制内嵌上游 bundle) |

## 5. Issues / EnterpriseCollaboration 重建(用户拍板后当日完成)

**后端**(AionCore `368d7fd`):新增 `one-devops` crate(自有 `_one_devops_migrations` 账本):
- `one_requirements`(type epic/feature/story/bug/task × status backlog/planning/developing/testing/completed × priority low/medium/high/urgent,CHECK 约束)+ `one_requirement_comments`
- `one_skill_registry` / `one_mcp_registry` / `one_rag_documents`(RAG 是元数据注册表——chunk/embedding/搜索管线待嵌入模型选型后另做)
- 路由 `/api/one/devops/*`:requirements tree(嵌套森林)/ POST / PATCH(区分缺省与显式 null)/ DELETE(递归子树级联含评论)/ comments;三个注册表 list/upsert/delete。挂 auth 中间件,成员可写
- 单测 5 例 + API 冒烟 12 步全过;测试池 `max_connections(1)` 修 `sqlite::memory:` 多连接空库 flake(⚠️ 新 crate 写 sqlx 内存库测试必须锁单连接)

**前端**(AionUi `46b88d4`):ipcBridge `oneDevops` 域 + `types/devops/devopsTypes.ts`;superAssistant 新增「协作看板」tab(IssuesTab:五列状态看板/新建/详情抽屉/状态流转/删除/评论)+ CollaborationContextPanel(知识库/Skills/MCP 标签汇总)。

**本期明确不做**(后续项):
- 1one 编排类动作(assign 数字员工自动跑 / breakdown 自动拆解 / autopilot)——依赖 1one team-slot 模型,应对齐 v2 one-employee 体系重新设计
- RAG 向量管线(需先拍板嵌入模型)、RAG/Skills/MCP 注册表的管理界面(面板导航按钮暂略)
- milestones / test plans / pipelines / value stream 等其余 DevOps 全家桶域

**遗留/开放项**:
- fork 安装包沿用上游品牌(AionUi/com.aionui.app);若灰度需要 1ONE 品牌与图标,需要改 electron-builder.yml 的 appId/productName(注意会改变 userData 路径,须连同 one-import 源定位一起回归)——待产品拍板。
- `acp.customAgents`(15 条自定义 agent)未迁移,待 v2 agent 体系映射专项。
- fork AionCore 的 CI release 流水线未建(现用本地 cargo 产物 + `AIONUI_BACKEND_LOCAL_PATH`);建成后打包切 `AIONUI_BACKEND_REPO=gaogg521/AionCore`。
- LDAP 管理 UI 卡片未加(M4a SSO 设置 tab 只有 feishu/dingtalk/wecom 三卡片);LDAP 配置可走 `PUT /api/one/admin/sso/ldap`,登录页 LoginSsoButtons 已过滤 ldap,登录表单入口待渠道 E2E 轮一起做。
