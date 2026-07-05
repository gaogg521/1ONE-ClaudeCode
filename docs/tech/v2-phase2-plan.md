# v2 二期计划（Phase 2 Plan）

> 状态：2026-07-05 起草。一期（M0-M5 + 遗留项清扫 + Issues/EnterpriseCollaboration 看板重建）已全部完成。本文档把散落在 `v2-m5-migration.md` §4/§5、`v2-handoff-quickstart.md` 下一步清单、CONTEXT 第十九轮的全部开放项**合并为二期唯一排期入口**。
>
> 工作目录与编译命令见 `docs/tech/v2-handoff-quickstart.md`；fork 现状：AionCore `368d7fd` / AionUi `46b88d4`（均在 one-main）。

## 0. 前置决策（需用户拍板，按解锁范围排序）

这些决策不落地，对应实施项无法开工。建议按序逐个拍板：

| # | 决策 | 解锁项 | 参考 |
|---|---|---|---|
| D1 | **嵌入模型选型**（本地模型如 bge/gte + ONNX/candle 内嵌，还是走 API 如 OpenAI/智谱，还是依赖用户本机 Ollama） | A2 RAG 向量管线 | `one_rag_documents` 现状见 m5 文档 §5 |
| D2 | **微信 iLink vs bridge** | C1 渠道 E2E 微信部分 | CONTEXT 第十/十一轮 |
| D3 | **fork 安装包品牌**（AionUi → 1ONE：改 electron-builder.yml appId/productName；⚠️ 会改变 userData 路径，须连同 one-import 源定位一起回归） | B3 品牌化实施、灰度正式发布 | m5 文档 §5 遗留项 |
| D4 | **workflow scope → CI** | 渠道 workflow 相关收尾 | CONTEXT 第十/十一轮 |
| D5 | **E2E 凭据与环境**（飞书/钉钉/TG/微信渠道凭据、OAuth 应用、真实 AD/OpenLDAP 目录） | C 组全部验证项 | 测试实例重启命令见 CONTEXT 第十二轮 |

## A. DevOps 域二期（核心功能，一期看板的延续）

### A1 看板编排动作（assign 数字员工 / breakdown 自动拆解 / autopilot）

- **内容**：需求卡片上的编排动作——assign 给数字员工自动执行、epic/feature 自动拆解为子需求、autopilot 全自动流转。
- **设计约束**：不照搬 1one 的 team-slot 模型；必须对齐 v2 `one-employee` 体系（M3 crate，设计见 `docs/tech/v2-m3-employee-design.md`）重新设计。**实施前先出一份编排设计文档**（employee ↔ requirement 关联模型、执行会话归属、状态回写路径）。
- **入口**：后端 `one-devops` crate（AionCore `368d7fd`）+ 前端 IssuesTab（AionUi `46b88d4`）。
- **建议顺序**：assign（单卡片手动指派执行）→ breakdown（LLM 拆解生成子树）→ autopilot（规则驱动自动流转），逐级验证再上一层。

### A2 RAG 向量管线

- **内容**：chunk 切分 → embedding → 向量存储与检索。现状 `one_rag_documents` 只是元数据注册表，无向量能力。
- **前置**：决策 D1（嵌入模型选型）。选型直接决定存储方案（sqlite-vec / 纯内存 / 外部向量库）与打包体积。
- **入口**：`one-devops` crate 扩展或独立 `one-rag` crate（视管线复杂度，建议独立 crate，遵守单目录 ≤10 子项约定）。

### A3 Skills / MCP / RAG 注册表管理界面 ✅（2026-07-05 完成）

- **交付**（AionUi `fd3c369`）：superAssistant 新增「协作资源」tab（`registries/` 目录：SkillsSection/McpSection/RagSection），三注册表列表/新增/编辑/删除/启用开关；ipcBridge oneDevops 补 upsert/delete 六通道；CollaborationContextPanel 补「管理资源」导航按钮（经 IssuesTab 透传）。
- **验证**：tsc/oxlint 零告警；浏览器 WebUI 实测 Skill 创建→出现在表格→开关切换→删除全链路通过。

### A4 其余 DevOps 域

- **内容**：milestones / test plans / pipelines / value stream 等 DevOps 全家桶剩余域。
- **建议**：需求驱动、按需排期，不一次铺开。若做，**milestones 优先**（与现有 requirements 树关联最紧，表结构增量最小）。
- **入口**：`one-devops` crate 增表 + `_one_devops_migrations` 账本增 migration。⚠️ 新增 sqlx 内存库测试必须 `max_connections(1)`（一期踩坑）。

## B. 工程与灰度收尾

| # | 项 | 前置 | 说明 |
|---|---|---|---|
| B1 | **AionCore CI release 流水线** | 无 | GitHub Actions 编 release 产物；建成后打包切 `AIONUI_BACKEND_REPO=gaogg521/AionCore`，摆脱本地 cargo + `AIONUI_BACKEND_LOCAL_PATH` 手动链路（现状见 m5 文档 §2） |
| B2 | **acp.customAgents 迁移专项** | 需 v2 agent 体系映射设计 | 15 条自定义 agent 一期未迁（v2 agent 体系不同构），见 m5 文档 §1「不迁」清单 |
| B3 | **fork 品牌化实施** | 决策 D3 | 改 appId/productName + 图标；回归 userData 路径与 one-import 源定位 |
| B4 | ~~LDAP 管理 UI~~ | — | ✅ 2026-07-05 完成（AionUi `9af7c6b`）：SSO 设置 tab 加 LDAP/AD 卡片（字段对齐 LdapProviderConfig）；登录页「LDAP 域账号」入口 + 账密表单（POST /api/one/sso/ldap/login，成功走 AuthContext.refresh）。浏览器实测：入口渲染/表单展开/错误路径提示正常；真实目录成功路径待 C3 |
| B5 | ~~aioncore 内嵌 web 资产重建~~ | — | ✅ 2026-07-05 查证后关闭：**前提不成立**。fork aioncore 二进制不服务 SPA（根路径 404 JSON，源码无任何 HTML 路由）；浏览器 WebUI 由 `@aionui/web-host` 静态服务 **fork 自己的 out/renderer**（`bun run webui` 与桌面 WebUI 同链路，见 webuiConfig.ts `staticDir: ../renderer`）。旧说法「aioncore 内嵌上游 bundle」出自 M4b 轮误判（当时可能对着上游官方 release 二进制测）。无需任何 Rust 侧改动 |

## C. 验证轮（等决策 D5 凭据/环境）

| # | 项 | 前置 |
|---|---|---|
| C1 | 渠道真实配对 E2E（飞书/钉钉/TG/微信） | D5 凭据；微信部分另需 D2 |
| C2 | M4d OAuth E2E | D5 OAuth 应用 |
| C3 | LDAP 真实目录 E2E | D5 AD/OpenLDAP 环境（路由冒烟 5/5 已过，见 m5 文档 §4） |
| C4 | M4b 视觉 E2E（登录页 SSO 按钮） | ~~B5~~ 无（B5 关闭后解锁）。2026-07-05 已验浏览器渲染链路：LDAP provider 配置后登录页出现「LDAP 域账号」入口、表单展开、错误路径提示正常（OAuth 按钮走同一 providers 渲染路径）；剩真实 OAuth 302 跳转与真实目录登录成功路径，归入 C1-C3 |

## 建议排期（三个波次）

1. **波次一（无前置，可立即开工）**：A3 注册表管理 UI、B1 CI 流水线、B4 LDAP 管理 UI、B5 web 资产重建。全部是纯实施项，互相独立可并行。
2. **波次二（需决策/设计先行）**：A1 编排动作（先出设计文档）、A2 RAG 管线（等 D1）、B2 customAgents 映射专项、B3 品牌化（等 D3）。
3. **波次三（等外部环境）**：C 组验证轮全量跑通 + A4 其余 DevOps 域按需求排期。C 组全绿后进入 m5 文档 §3 的灰度切换判据流程。

## 路由（详情按需读原文）

- 一期收尾与遗留全貌：`docs/tech/v2-m5-migration.md`（§4 清扫表、§5 Issues/EC 重建与后续项）
- 权威未完成项清单 v4：`CONTEXT.md` 第十九轮
- 接手入门/命令/踩坑：`docs/tech/v2-handoff-quickstart.md`
- one-employee 体系（A1 设计对齐对象）：`docs/tech/v2-m3-employee-design.md`
