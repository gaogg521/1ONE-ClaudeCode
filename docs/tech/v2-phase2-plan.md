# v2 二期计划（Phase 2 Plan）

> 状态：2026-07-05 起草。一期（M0-M5 + 遗留项清扫 + Issues/EnterpriseCollaboration 看板重建）已全部完成。本文档把散落在 `v2-m5-migration.md` §4/§5、`v2-handoff-quickstart.md` 下一步清单、CONTEXT 第十九轮的全部开放项**合并为二期唯一排期入口**。
>
> 工作目录与编译命令见 `docs/tech/v2-handoff-quickstart.md`。

## 接手状态（2026-07-06 更新，下一会话从这里继续）

**已完成**：D1-D5 决策全拍板（§0）；波次一 A3/B4 完成、B5 关闭、B1 CI 建好；**A1 L1 派活**、**A4 milestones**、**A2 RAG 向量管线**全部完成并浏览器 E2E 验证；**A1 L2 breakdown**（2026-07-06）完成并**真实 claude CLI 后端 E2E 验证**（epic→6 条子需求正确落库）。

**fork 现状（HEAD）**：AionCore one-main = `12f5104`；AionUi one-main = `de45638`。⚠️ **L2 改动尚未提交**（两个 fork 有未提交工作树改动 + AionUi 有 B1 收尾的 package.json/prepare-aioncore.js 未提交），提交时机等用户决定（见记忆 feedback-priority-and-scope）。L2 改动清单：
- AionCore：`one-employee`（provision_run 抽取 + run_prompt_blocking + RunReply + extract_latest_reply/truncate_summary + TRIGGER_BREAKDOWN）、`one-devops`（breakdown.rs 模块 + create_breakdown_children + /breakdown 路由）。
- AionUi：`ipcBridge.ts` 加 breakdownRequirement；`IssuesTab.tsx` 加「自动拆解」按钮。

**B2 也已完成**（自建 ACP 后端迁移路径；见下表 B2 行）——AionUi 加 `oneMigration/importOneCustomAgents.ts` + `runBackendMigrations` 迁移步。改动同样**未提交**。

**剩余待办（按建议优先级）**：
1. **A1 L3 autopilot + 团队共享数字员工**（任务 #11）——较大，依赖 one-employee 从个人级(owner 隔离)扩展到 tenant 级共享 agent。用户已拍板本轮继续做。
2. **A4 其余 DevOps 域**（test plans/pipelines/value stream）——需求驱动按需做。
3. **C 组真实环境 E2E**（任务 #12）——⛔ 卡 D5 用户凭据/环境，无法自主，代码路径已就绪。

**RAG 验证脚手架**：mock embedding 端点在 `<scratchpad>/mock_embed.py`（`python mock_embed.py` 起 :25990，OpenAI 兼容 /embeddings，返回字符直方图向量）；配 base_url=`http://127.0.0.1:25990/v1` model=`mock` 即可离线验证 RAG 全链路。

> fork 现状：AionCore `8e02689` / AionUi `de45638`（均在 one-main）。

## 0. 前置决策（2026-07-05 用户授权自主拍板）

用户 2026-07-05 授权自主决策 D 组。结论如下：

| # | 决策 | 结论 | 解锁项 |
|---|---|---|---|
| D1 | 嵌入模型选型 | ✅ **OpenAI-compatible embeddings provider 抽象**：设置里配 base_url + key + model；云端点或私有端点（vLLM/Ollama/Xinference 的 OpenAI 兼容口）皆可。不内嵌大模型文件（避打包体积 + Windows Defender 首扫坑），不硬依赖 Ollama。隐私由"部署方指自己的端点"保证，符合"数据不离开"定位 | A2 RAG |
| D2 | 微信 iLink vs bridge | ✅ **采用上游官方 iLink Bot（选项 A 已白送）**，不移植 fork 的本地 bridge 个人号形态。理由：个人号自动化有封号/合规风险，官方 Bot 是正道；移植 WeixinMonitor 是 1-2k 行额外工作，收益仅"个人号"这一有风险形态。若用户后续明确要个人号，再单独立项 | C1 渠道 E2E 微信部分 |
| D3 | fork 安装包品牌（AionUi→1ONE） | ✅ **暂不做，推迟到正式灰度前一次性做**。理由：改 appId 会改 userData 路径，牵动 M5 one-import 源定位回归；开发迭代期频繁改会让本地测试数据目录漂移；品牌收益在灰度前无实际价值 | B3（推迟） |
| D4 | workflow scope → CI | ✅ **已解决**。B1 期间实证：成功推送 `.github/workflows/release.yml` 修改并 `gh workflow run` dispatch，说明 gh token 已具 workflow scope。无残留动作 | — |
| D5 | E2E 凭据与环境 | ⛔ **无法自主**——硬依赖用户提供的真实凭据/目录/OAuth 应用。C 组验证全部卡此。这是唯一真正等用户的项 | C 组全部 |

## A. DevOps 域二期（核心功能，一期看板的延续）

### A1 看板编排动作（assign 数字员工 / breakdown 自动拆解 / autopilot）

- **设计文档**：`docs/tech/v2-a1-orchestration-design.md`（三层路线 + L1 实现细节 + 验证记录）。
- **L1 assign + 手动派活** ✅ 2026-07-05 完成（AionCore `c9e2093` + AionUi `b1b967f`）：需求指派给数字员工 → 派活让员工带需求上下文跑一次 → 状态推进 developing + agent 评论回写会话/run。后端 curl + 浏览器 E2E + 单测全过。**L1 限制**：只能派给操作者自己的数字员工（个人级隔离）。
- **L2 breakdown** ✅ 2026-07-06 完成（未提交，见接手状态）：数字员工阻塞式 run（`run_prompt_blocking`）读 epic → claude 返回 JSON 数组 → 宽松解析（剥围栏/clamp 枚举）→ 批量建子需求树 + agent 评论回写。真实 claude CLI 后端 E2E 通过（6 条子需求正确嵌套）。设计与验证详见 `v2-a1-orchestration-design.md` L2 段。
- **L3 autopilot**（自动触发 + 团队共享数字员工，依赖 one-employee tenant 改造）——后续。

### A2 RAG 向量管线 ✅（2026-07-05 完成）

- **交付**（AionCore `8e02689` + AionUi `de45638`）：D1 决策落地——OpenAI-compatible embedding endpoint。
  - 后端 `one-devops/src/embedding.rs`：`/embeddings` 客户端（base_url/key/model）+ f32 向量打包/解包 + 余弦相似 + 字符级 chunk（纯函数单测）。migration 003：`one_rag_config`（单例配置）+ `one_rag_chunks`（向量 BLOB）+ `one_rag_documents.content` 列。服务：config get/set（key 不回显、缺省保留）、set content、process（chunk→embed→存→status ready+chunk_count+回填 dimensions）、search（query embed→全量余弦 top-k）；delete 级联删 chunks。路由 `/rag/config`、`/rag/documents/{id}/content`、`/rag/documents/{id}/process`、`/rag/search`。
  - 前端 RagSection：嵌入端点配置弹窗、注册文档带内容、处理按钮（显示状态/片段数/维度）、语义检索框（top-k 带相似度分）。
- **验证**：单测 9/9；本地 mock embedding 端点（scratchpad/mock_embed.py，字符直方图向量）端到端 —— curl + 浏览器 E2E 均确认检索正确排序（"内存安全 所有权" → Rust 文档 0.776 vs 无关 0.367）。
- **后续可做（非阻塞）**：① 检索结果注入编排 dispatch（派活时把相关 chunk 附到任务上下文）；② 文档从 file_path 服务端读文件（现仅支持贴文本 content）；③ 大语料换近似检索（现为全量余弦，语料小够用）。

### A3 Skills / MCP / RAG 注册表管理界面 ✅（2026-07-05 完成）

- **交付**（AionUi `fd3c369`）：superAssistant 新增「协作资源」tab（`registries/` 目录：SkillsSection/McpSection/RagSection），三注册表列表/新增/编辑/删除/启用开关；ipcBridge oneDevops 补 upsert/delete 六通道；CollaborationContextPanel 补「管理资源」导航按钮（经 IssuesTab 透传）。
- **验证**：tsc/oxlint 零告警；浏览器 WebUI 实测 Skill 创建→出现在表格→开关切换→删除全链路通过。

### A4 其余 DevOps 域

- **milestones** ✅ 2026-07-05 完成（AionCore `19ba3c2` + AionUi `4652aa2` + `8ca7985`）：`one_milestones` 表（migration 002）+ CRUD + 路由；requirement 经详情抽屉下拉关联 milestone；协作资源 tab 加里程碑管理区（状态/截止日期/删除时清理关联需求软链）。后端 curl + 单测 + 浏览器 E2E 全过（含修复 Arco DatePicker 经 Form 传字符串导致 dueAt 未保存的 bug）。补齐了 `requirement.milestone_id` 自 001 起悬空的问题。
- **test plans / pipelines / value stream** 等其余域：需求驱动、按需排期，未做。入口同 `one-devops` crate 增表 + migration。⚠️ 新增 sqlx 内存库测试必须 `max_connections(1)`。

## B. 工程与灰度收尾

| # | 项 | 前置 | 说明 |
|---|---|---|---|
| B1 | **AionCore CI release 流水线** | 无 | GitHub Actions 编 release 产物；建成后打包切 `AIONUI_BACKEND_REPO=gaogg521/AionCore`，摆脱本地 cargo + `AIONUI_BACKEND_LOCAL_PATH` 手动链路（现状见 m5 文档 §2） |
| B2 | ~~acp.customAgents 迁移专项~~ | — | ✅ 2026-07-06 完成（未提交，见接手状态）：迁移 1one **自建 ACP 后端**（`acp.customAgents` 非预设项：`defaultCliPath`+`env`）→ fork `POST /api/agents/custom`。AionUi 加 `oneMigration/importOneCustomAgents.ts`（纯 mapper `oneCustomAgentToImport` + `collectOneCustomAgents` + 后端迁移步 `migrateOneCustomAgents`，接入 `runBackendMigrations` 的 MIGRATION_STEPS，marker flag `migration.oneCustomAgentsMigrated_v1` + 按 name 去重幂等）。单测 5/5。**关键发现**：文档旧说的「15 条」经查真实数据**全是 builtin 预设**（Word/PPT/Excel Creator 等，fork `migrateAssistants` 白名单已含同名 builtin，自带等价物），自建后端 0 条——故本机无真实 E2E 数据，代码对「有自建 CLI 的用户」正确。预设上的用户定制（禁用态/后端选择/规则文件）与 `migrateAssistants` builtin-override 逻辑重叠、价值边际+有覆盖 builtin 风险，用户拍板**不做**（B2 收尾于自建后端路径）。 |
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
