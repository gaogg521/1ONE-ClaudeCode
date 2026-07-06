# v2 审计与开放项汇总（Audit & Open Items）

> 状态：2026-07-06 起草。本文档把 **① 剩余待办**（原 `v2-phase2-plan.md` 接手状态段）、**② BUG 扫描清单**（新增代码安全/健壮性扫描）、**③ 三方面专项审计**（上游同步 / 品牌加载 / 性能）合并为**唯一开放项入口**。修复时以本文档为对照。
>
> fork 现状：AionCore `6c398e6` / AionUi `4c5ec67`（均 one-main）。扫描范围：fork 新增 `one-*` crates（~9000 行 Rust）+ AionUi 二期新增前端模块。

---

## 第一部分 · 剩余待办（功能/流程）

一期 + 二期主线均已收官。剩余项按优先级：

| # | 项 | 状态 | 说明 |
|---|---|---|---|
| T1 | **重打包收尾** | 🔵 可立即做 | B3 rebrand + i18n(551处) + A4 新域 + B1 后端源默认切 fork 都在源码、未出安装包。出包前先 bump `package.json` version、**不删任何旧 .exe**（memory `feedback-build-artifacts`）；`AIONUI_BACKEND_LOCAL_PATH=... bun run dist:win`；回归 rebrand 后 userData 路径与 one-import 源定位 |
| T2 | **钉钉 / 企业微信 SSO** | 🅿️ 用户明确暂缓 | 2026-07-06 决定暂缓，等真实凭据再做并更新文档（非漏做）。代码就绪，仅缺配置。redirectUri 模板 `.../api/auth/{dingtalk\|wecom}/callback` |
| T3 | **C 组跨用户活体 E2E** | ⛔ 卡 D5 环境 | 多用户企业组织下 A1 L3 团队共享验证 + M4d OAuth 302 真跳转。飞书/LDAP 单机 E2E 已过 |
| T4 | **A4 value stream 价值流域** | 🔵 需求驱动 | test plans + pipelines(CI) 已做；价值流子域未做。入口同 one-devops 增表 + migration（⚠️ 内存库测试 `max_connections(1)`） |
| T5 | **A1 L3 存量员工 tenant backfill** | ⚪ 可选 | 改动前建的员工 tenant='default'，企业用户要共享需 backfill；新员工已带正确 tenant，非阻塞 |
| T6 | **A2 RAG 三增强** | ⚪ 可选 | ① 检索注入 dispatch；② file_path 服务端读文件；③ 大语料换近似检索 |

> 已完成清单与逐项证据见 `docs/tech/v2-phase2-plan.md`。

---

## 第二部分 · BUG 扫描清单（2026-07-06 只扫未修）

### 🟠 真实问题（低危，值得修）

| # | 位置 | 问题 | 影响 | 修复方向 |
|---|---|---|---|---|
| **B1** | `one-devops/src/routes.rs` `dispatch_core`+`maybe_autopilot` | **派活状态门 TOCTOU 竞态**：重入守卫是"读 status → 跑 agent → 写 developing"，非事务。并发触发（快速 create+update、手动派活撞 autopilot）可能两边都读到 pre-dev 状态各跑一次 | 同一需求**重复派活**（两次 run + 两条评论），浪费额度；非数据损坏 | 条件 UPDATE 抢占：`UPDATE ... SET status='developing' WHERE id=? AND status IN('backlog','planning')`，仅 `rows_affected==1` 才跑 |
| **B2** | `one-devops/src/breakdown.rs:94` `extract_json_array` | **贪婪切片误判**：`find('[')..rfind(']')` 取最外层括号对；散文里杂散 `[`/`]` 会切多 → serde 失败 → 报"拆解失败"，即便模型产出了有效项 | 偶发**假失败**（无崩溃，优雅降级） | 可选：多候选提取或按 `[{`…`}]` 收窄 |

### 🟡 观察项（非缺陷，记录备查）

| # | 位置 | 说明 |
|---|---|---|
| O1 | `one-devops/src/service.rs` RAG search | 全量加载 chunk 内存算余弦，O(n)/查询；当前元数据级够用，大语料需近似检索（同 T6③） |
| O2 | 各 crate `migrate.rs` | 迁移 SQL 用 `.unwrap()`，坏迁移/损坏 DB 启动 panic（fail-fast）。可接受但知悉 |
| O3 | `one-sso/src/routes.rs:201` 桌面深链 | session token 走 `aionui://sso-callback?token=...` 协议 URL；可能被 OS 记录/同 scheme 应用截获——桌面 OAuth 深链固有权衡（已 urlencode） |

### ✅ 已扫且通过（覆盖面）

- **租户隔离（L3 共享）全链路正确**：SQL 谓词 `own OR (shared AND 同租户)`；tenant 服务端解析（`tenant_of(user.id)`，不信任客户端传值）；派活/拆解经 `resolve_agent_for_use` gate，跨租户→NotFound
- **SQL 注入面干净**（全 sqlx 参数化）；**OAuth CSRF 到位**（callback 强制 state→`consume` 单次防重放→校验 provider 匹配）
- **密钥安全**：embedding api_key 仅 `bearer_auth` 不落日志；迁移只记 `api key present: yes/no`；LDAP bindPassword 不 log
- **Panic 面**：devops/org/employee service.rs 的 77 处 unwrap/panic 全在 `#[cfg(test)]` 内
- **LDAP TLS**：`rejectUnauthorized:false` 仅测试 fixture；运行时默认 `default_true`
- **embedding 数学**：unpack `chunks_exact`（畸形 blob 不 panic）；cosine 守零向量/长度不匹配；排序 `unwrap_or(Equal)` 防 NaN
- **前端迁移**：每步 try/catch、按 name 去重幂等、无 XSS/空 catch/密钥日志；DatePicker 字符串坑仅 Milestones 有且已修

### ⚠️ 未深扫（供下轮）

`one-org/rbac.rs`（RBAC 判定）、one-admin 全量、one-sso 各 provider 内部换 token 细节、桌面主进程 wiring、原版 1one-command SSO 代码。

---

## 第三部分 · 三方面专项审计（2026-07-06）

### 1. 上游能力同步（技能 / 工具 / MCP）——⚠️ **未同步，落后较多**

**结论：fork 未跟上游最新，落后 `upstream/main` 100 个提交、8 个版本。**

- **证据**（在 fork AionUi 仓库内 `git rev-list --left-right --count upstream/main...one-main` = `100 21`）：
  - 上游 `upstream/main`（iOfficeAI/AionUi，截至 fork 本地 07-03 fetch）= **2.1.29 + AionCore v0.1.42**（commit `7043364`）
  - 上游独有 100 提交含 **2.1.22 → 2.1.29 全部版本 bump**（AionCore v0.1.34 → v0.1.42），说明 **fork 分叉点早于 2.1.22**
  - fork `package.json` = **2.1.28 是本地 `bump-version` 自赋**，**不代表已同步上游 2.1.28**（易误读）
- **内置能力对比**：fork 与上游镜像的 `builtinMcp/` 都是 `constants.ts + imageGenServer.ts`（当前内置 MCP 一致）；skills 为运行时下载（`builtin-skills/`），非源码内置
- **影响**：上游 8 个版本间对 skills 调用、MCP、工具、agent 运行时（v0.1.34→v0.1.42）的改进/修复**均不在 fork**。memory `skills-invocation-architecture` 已记"上游 v2.1.24-28 修同类问题，fork 无血缘只能 cherry-pick"
- **建议**（需用户拍板，非自动）：定期 `git fetch upstream` → 评估 100 提交中与 skills/MCP/tools/agent-runtime 相关者 → 因无共同祖先只能**选择性 cherry-pick**（直接 merge 会大面积冲突）。可先跑 `git log upstream/main ^one-main --oneline` 人工过一遍高价值项

### 2. 1ONE Code 品牌加载——✅ **i18n 已补齐（2026-07-06 修复）**

> **更新**：i18n 遗漏已修复。桌面 `317a327`——12 语言 72 文件共 **551 处**；mobile `4c5ec67`——5 语言 5 文件 **20 处**。合计 **571 处** `AionUi`→`1ONE Code`（区分大小写；不动 AionCore 后端名、aionui.com/aionui:// 技术标识、JSON key；替换后全部 JSON 校验通过）。⚠️ **需 `dist:win` 重打包（T1）才在安装版可见**。以下为修复前记录。

**（原结论）rebrand 只改了打包/壳层，未改 i18n；locales 里有 564 处用户可见 "AionUi"。**

- **已改**（commit `e41a804`）：`package.json` / `electron-builder.yml` / `index.html` / `Titlebar` / guid 作者信息 / `app.ico` + `app.png`
- **故意保留**（避免破坏数据/SSO）：appId、协议 scheme `aionui://`、DB source 枚举、JWT issuer、数据目录——**合理**
- **遗漏（真实品牌泄漏）**：rebrand 提交**完全没碰 `renderer/services/i18n/locales/`**。全语言翻译串仍是 "AionUi"：
  - 托盘菜单："关于 AionUi" / "显示 AionUi"（`common.json` tray.about / tray.showWindow）
  - 快捷提示："AionUi 能做什么？"（`conversation.json` quickActionsTitle）
  - 错误/启动弹窗：多处 "AionUi opened…" / "reinstall AionUi…"
  - 命中 **564 处**（`grep -rniE '\bAionUi\b' locales/`，已排除 aionui.com/aionui:///github）
- **影响**：用户在托盘、关于、欢迎页、错误弹窗看到的仍是 "AionUi"，与 1ONE Code 品牌不一致
- **注意**：memory `fork-1one-rebrand.md` 称"已改用户可见层"**表述过宽**，i18n 是极高频用户可见层，实际未改
- **建议**：批量替换 locales 中作为**品牌名**的 "AionUi" → "1ONE Code"（保留 aionui.com/aionui:// 等技术标识）；随重打包（T1）一起验证

### 3. 性能（卡顿 / 无响应）——✅ **后端稳健，2 个硬化观察项**

- **后端 Rust 无阻塞**：`run_prompt_blocking` / `run_now_with_context` 全 async `.await`，不阻塞 tokio 运行时；`run_agent_turn` 内部 `tokio::time::timeout(50ms, rx.recv())` 轮询（非阻塞）；ACP agent 有 **5 分钟 idle 超时**（`idle_scanner.rs`）
- **新 UI 无明显卡顿源**：registries/IssuesTab 无 `setInterval`/轮询；Arco Table 自带分页；派活/拆解按钮有 `loading`/`dispatching` 态
- **观察 P1（低-中）**：**httpBridge.ts 无客户端请求超时**（`grep timeout/AbortSignal` = 0 命中，仅有 WS 重连定时器）。对照 1one 老坑"fetch 无超时→loading 永久 true"。长拆解/派活（agent 跑数分钟）全靠服务端返回；若服务端真挂起 → **前端永久转圈**。建议给长请求配**宽松超时**（如与 5 分钟 idle 对齐）而非无超时
- **观察 P2（低）**：`run_agent_turn` 仅有 idle 超时（5 分钟无输出），**无整体硬上限**；持续缓慢输出的 agent 可长时间占用请求。当前 breakdown 场景可接受
- **关联**：B1（autopilot TOCTOU 重复派活 = 额度/负载浪费）、O1（RAG 全量扫描 = 大语料性能）

---

## 路由

- 已完成清单与排期：`docs/tech/v2-phase2-plan.md`
- 一期收尾全貌：`docs/tech/v2-m5-migration.md`（§4 清扫、§5 看板重建）
- 接手入门/命令：`docs/tech/v2-handoff-quickstart.md`
- 品牌决策：memory `fork-1one-rebrand.md`（本文档已订正其"已改用户可见层"的过宽表述）
