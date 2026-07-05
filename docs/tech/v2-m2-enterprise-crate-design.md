# M2 设计 — 企业版能力在 AionCore fork 中的 crate 化

> **进度**：M2a ✅ 完成（2026-07-05，fork commit `d11d120`）。one-org crate 落地：自管迁移器（`_one_migrations`）+ 五表 + `/api/one/org|admin/*` 路由 + RBAC extractor + join/exit/create/邀请码全逻辑。验收：单测 6/6、`--local` curl 冒烟 16/16。§4 的风险点已消除——上游 `CurrentUser`/`hash_password`/`verify_password`/`update_jwt_secret` 全部 pub，**零 diff 进 aionui-auth**；会话失效用 per-user jwt_secret 轮换实现（比 TS 全局失效更精确）。上游 diff 实测：workspace Cargo.toml +2 行、aionui-app Cargo.toml +1 行、routes.rs 3 个小 hunk（挂载+启动迁移）。
>
> **M2 剩余范围（2026-07-05 核实）**：原 §6 里程碑里的 M2c（邀请码 join/exit/建企业 + RBAC extractor + 审计）**已并入 M2a 交付**（commit d11d120 标题即"join/exit/create + 邀请码 + RBAC"，五表含 one_tenant_invites/one_audit_logs）。
> - **M2b 飞书 SSO** ✅ 完成（2026-07-05，fork commit `a442bfb`）：one-sso crate + FeishuProvider（build_authorize_url + exchange_code + fetch_user_info + test_credentials）+ JIT（resolve_or_provision_user）+ 会话签发（JwtSecret::sign + CookieConfig，零 diff 进 aionui-auth）+ 公开路由（providers/authorize/callback）+ admin 路由（PUT /api/one/admin/sso/{provider}）。
> - **M2d 钉钉/企微** ✅ 完成（2026-07-05，fork commit `a442bfb`）：DingtalkProvider + WecomProvider，复制飞书模式。**LDAP 暂未做**（1one LdapAuthProvider 525 行很重，需 ldap3 crate + 复杂目录搜索，留后续）。
> - **M2e 管理后台 API 收尾** ✅ 完成（2026-07-05，fork commit `a442bfb`）：扩展 one-org 加 list_users / set_user_role / list_audit_logs / list_runtime_nodes / heartbeat_runtime_node，路由 GET /api/one/admin/users + PUT /users/:id/role + GET /audit + GET /runtime/nodes + POST /runtime/heartbeat，全部 RequireOrgAdmin 保护。
>
> **M2 整体完成度**：M2a/M2b/M2d/M2e ✅；M2c 已并入 M2a；LDAP 待后续。验收：单测 29/29（one-org 6 + one-employee 6 + one-sso 17）+ `--local` 冒烟全过（SSO providers/authorize/callback + admin users/audit/runtime/role）。
>
> 2026-07-05 预研稿（M2 开工前基准）。现有 TS 实现（`src/process/webserver/auth/**` 约 4.2k 行 + `adminRoutes.ts` 1.4k 行）作为逻辑规格书，翻译为 AionCore fork（gaogg521/AionCore，one-main@v0.1.41）的自有 crate。

## 1. crate 布局（二开收敛原则：新增 crate + 最小挂载 diff）

```
crates/
  one-org/          # 租户/成员/邀请/角色/组织架构/设备注册表
  one-sso/          # SSO providers(飞书/钉钉/企微/LDAP) + OAuth 回调 + JIT + 策略
```

命名用 `one-` 前缀（区别上游 `aionui-` 命名空间，rebase 时一眼可辨）。对上游文件的全部 diff 限定为：

| 上游文件 | diff 内容 |
|---|---|
| `Cargo.toml`（workspace members） | +2 行 |
| `crates/aionui-app/src/router/routes.rs` | merge `one_org_routes()` / `one_sso_routes()`（约 4 行） |
| `crates/aionui-app/Cargo.toml` | +2 依赖 |
| `crates/aionui-auth/src/middleware.rs` | 见 §4（争取零 diff，扩展点走请求扩展） |

## 2. 数据库策略（关键决策：自管版本表，不进上游 migrator）

上游用 `sqlx::migrate!()` 单一 `_sqlx_migrations` 表、文件名序号 001-017（v0.1.41）。若我们把迁移文件混进同一目录：rebase 后上游新增 018/019 会与我们已应用的高序号形成 out-of-order，sqlx 不支持乱序应用 → **每次 rebase 都可能炸**。

**决策**：`one-org` 自带独立迁移执行器（启动时在 app bootstrap 后运行），版本记录在自有表 `_one_migrations`，SQL 文件放 `crates/one-org/migrations/`。与上游 migrator 完全解耦，rebase 零冲突。上游的 migration 不可变检查脚本不感知我们的目录，互不干扰。

表清单（从 1one schema v53 平移，均带 `tenant_id`）：

| 表 | 来源 | 说明 |
|---|---|---|
| `one_tenants` / `one_tenant_invites` | tenants/tenant_invites | 改前缀防未来撞名 |
| `one_user_org`（user_id, tenant_id, role, org_unit_path, org_profile_source, org_profile_synced_at） | users 表的企业列 | **不改上游 users 表**，企业属性外挂关联表（上游 users 无 tenant/role） |
| `one_auth_providers` / `one_auth_identities` | auth_providers/auth_identities | SSO 配置与外部身份映射 |
| `one_runtime_nodes` | team_runtime_nodes | 设备心跳注册表 |
| `one_audit_logs` | audit_logs | 管理审计 |

DevOps 全家桶（rag/requirements/milestones/test_plans…共 20+ 表）**不进 M2**——本机数据几乎全空，属独立产品面，需求成立后另立 crate。

## 3. 路由映射（Express → Axum）

| 现有 Express | 新路由（one-sso / one-org） | 备注 |
|---|---|---|
| `authRoutes` 中 SSO 部分（/api/auth/sso/{provider}/authorize、/callback） | `one-sso`：`/api/one/sso/{provider}/authorize`、`/callback` | provider = feishu/dingtalk/wecom/ldap；纯 HTTP OAuth 调用，TS→Rust 直译 |
| `ssoJitProvisioning` + `enterpriseAutoJoin` | `one-sso` service 层 | externalId 查 identity → 建用户（调上游 aionui-auth 的用户创建）→ 自动入租户 → org 路径同步 |
| `enterpriseJoinService`（邀请码 join/exit/建企业） | `one-org`：`/api/one/org/join`、`/exit`、`/create` | 错误码语义照搬（EXIT_PASSWORD 等） |
| `adminRoutes`（1370 行：users/teams/invites/mcp/skills/runtimes…） | `one-org`：`/api/one/admin/*` | M2 只迁企业管理核心（users/invites/roles/runtimes/audit）；DevOps 后台路由随其表一起延后 |
| `teamRuntimeRoutes` + Publisher 心跳 | `one-org`：`/api/one/runtime/heartbeat` + GET 列表 | 心跳发送端在前端/桌面侧改为纯 fetch（M4） |
| `orgProfile/`（飞书/LDAP 组织架构同步） | `one-sso` 后台任务（tokio interval） | |

路由前缀统一 `/api/one/*`——与上游 `/api/*` 命名空间隔离，避免 rebase 撞路由。

## 4. 认证集成（最难点，目标：不 fork aionui-auth 内部）

上游 auth：JWT（每用户 jwt_secret）+ CSRF + `--local` 免认证注入默认用户；JWT payload 只有 user_id/username，无角色。

方案：**RBAC 在 one-org 侧实现为 Axum extractor/middleware layer**，只包我们自己的 `/api/one/*` 路由：
1. 复用上游 auth middleware 完成身份认证（它会把 user 放进请求扩展）；
2. `one-org` 的 `RequireRole(role)` extractor 再查 `one_user_org` 得 tenant/role 做鉴权；
3. SSO 登录成功后的会话签发**调用上游 auth 的既有签发路径**（内部 API），不自造 token 格式——这样 QR 登录/CSRF/限流全部继承。
风险点：上游 auth 内部 API 是否 pub 可调，M2 开工第一周验证；不行则加最小 pub 导出（1-2 行 diff，可提上游 PR）。

## 5. 客户端/服务器语义在 v2 下的映射

- **服务器** = `aionui-web`（web-host + 我们 fork 的 aioncore）部署形态，天然成立；`--local` 关闭 → 走完整认证。
- **客户端（桌面连远端企业服务器）** = 上游桌面永远 spawn 本地后端,无"连远端"模式 → **M4 在 AionUi fork 侧做**：httpBridge 的 baseUrl 支持指向 enterpriseServerUrl（渲染层已有该机制雏形——WebUI 浏览器模式本就是 same-origin 远端），桌面加"企业模式"开关决定连本地还是远端。deploymentRole 状态机大幅简化：v1 里"桌面 app 兼职当服务器"的 origin 候选/回环 fallback 全部消失。
- **心跳/设备管理**：客户端桌面向企业服务器 `/api/one/runtime/heartbeat` 上报（M4 接线）。

## 6. M2 内部里程碑（建议）

| 步骤 | 内容 | 验收 |
|---|---|---|
| M2a | crate 骨架 + 自管迁移器 + one_tenants/one_user_org + `/api/one/org` CRUD | cargo test + curl 冒烟 |
| M2b | 飞书 SSO provider + JIT + 自动入租户（先做一家，验证 auth 集成模式） | 真实飞书应用 E2E 登录 |
| M2c | 邀请码 join/exit/建企业 + RBAC extractor + 审计 | 单测 + API 冒烟 |
| M2d | 钉钉/企微/LDAP providers + 组织架构同步 | 各 provider test 接口 |
| M2e | 管理后台核心 API（users/invites/roles/runtimes） | 与 M4 管理页联调 |
| — | **两周 checkpoint**（对比清单约定）：M2a+M2b 完成度评估，超预期则降级 Node sidecar | |

## 7. CI（依赖 workflow scope，当前被挡）

fork 需要 GitHub Actions：`cargo build --release` 六平台矩阵（照抄上游 release workflow 裁剪）+ release 产物上传，供 AionUi fork 的 `aioncoreVersion` 指向。**推 workflow 文件需要 gh token 的 workflow scope**（用户侧待解），或先在 GitHub 网页编辑器里手工创建 workflow 文件绕过。M2a 期间本地构建即可开发，CI 在 M2 中段补上不阻塞。
