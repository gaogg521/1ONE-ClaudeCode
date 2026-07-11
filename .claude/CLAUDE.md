## 项目路由入口（Memory Routing）

本文件是**项目级路由入口**：只放“读什么、什么时候读、去哪里找”，不放长篇原文。

> ### ⚠️ 先看这条：v2 fork 的活不在本目录
>
> `D:\1one-command` 是**旧版 1ONE ClaudeCode（过渡期生产）**。当前主力开发的 **v2 fork** 在
> **`D:\aionui-m0`**，由三仓组成：`1oneUI`（前端）、`1oneCore`（Rust 后端）、`aionrs-local`（fork = `gaogg521/aionrs`）。
> **凡是 Agent 运行时 / 助手 / 模型 / 网关 / 授权模式 / thinking 报错等问题，改动都在 `D:\aionui-m0`，不在这里。**
>
> - **本轮（2026-07-10~11）主文档**（思考模型报错全部结案 + 网关拒绝 tool_calls 用「文本化工具历史」绕过 + 授权模式默认「全自动」+ 上游对齐 + 黑盒探测网关方法论）：
>   `D:\aionui-m0\1oneUI\docs\guides\session-2026-07-10-thinking-param-and-rename.zh-CN.md`
> - v2 fork 各仓入口索引见各自的 `CLAUDE.md`：`D:\aionui-m0\1oneUI\CLAUDE.md`、`D:\aionui-m0\1oneCore\CLAUDE.md`。
> - 相关记忆摘要：`~/.claude/projects/D--1one-command/memory/gateway-thinking-bug-textualize-fix.md`、`thinking-param-fix-and-repo-rename.md`。

### 记忆策略（必须遵守）

- **记忆=摘要+路由**：把结论沉淀到 Claude Code 自动记忆（`~/.claude/projects/{project}/memory/*.md`），把原文留在仓库文档里。
- **原文=详情**：需要细节时，按下面的路由去读 `docs/**` 等原始文档。

### 关键文档（建议按任务先读）

- **项目全景（新会话首读）**
  - `docs/tech/project-overview.md`：**项目全景 onboarding**——项目是什么 / 三仓分布 / 三层架构 / 当前进度 / 后续路线 / 必读文档清单 / 常用命令 / 关键约束。全新 AI 会话第一次读这一份就能理解项目。

- **v2 迁移接手**
  - `docs/tech/v2-handoff-quickstart.md`：**接手快速入门（精炼自包含，一读就能干活）**——做 v2 迁移相关工作前必读
  - `docs/tech/v2-audit-and-open-items.md`：**开放项唯一入口**——剩余待办 + BUG 扫描清单 + 三方面审计（上游同步/品牌加载/性能）。做修复或审计相关工作前先读
  - `docs/tech/v2-phase2-plan.md`：**二期计划（唯一排期入口）**——前置决策 D1-D5、DevOps 二期（编排动作/RAG/注册表 UI）、工程收尾、验证轮、三波次排期。一期（M0-M5）已全部完成，做二期任何工作前必读
  - `docs/tech/v2-m5-migration.md`：M5 数据迁移/打包/灰度全记录 + §4 遗留清扫表 + §5 Issues/EC 看板重建
  - `CONTEXT.md` 第十九轮（最底部）：当前状态 + 权威未完成项清单 v4 + fork 现状

- **开发与运行**
  - `docs/development.md`：本地开发、常用脚本、环境说明
  - `docs/WEBUI_GUIDE.md`：WebUI 使用与注意事项
  - `docs/SERVER_DEPLOY_GUIDE.md`：服务端部署（如果涉及）
  - `docs/product/edition-personal-vs-enterprise.md`：个人版 / 企业团队版工作区 / 管理后台（产品文案源，改 UI 文案时先读）

- **架构与约束**
  - `docs/tech/architecture.md`：三进程架构、边界、IPC 约束
  - `docs/tech/skills-invocation.md`：技能调用机制（catalog 数据源、三条注入路径、关键不变量、排查入口）——改助手/技能相关代码前必读
  - `docs/tech/v2-architecture-comparison.md`：v2 架构迁移《对比清单》决策文档（五能力域对比、三策略选项、M0-M5 里程碑）——做架构迁移相关工作前必读
  - `docs/tech/v2-m2-enterprise-crate-design.md`：M2 企业版 crate 设计（M2 整体完成，进度头有 LDAP 待办）
  - `docs/tech/v2-m3-employee-design.md`：M3 数字员工 crate 设计（M3 整体完成）
  - `docs/tech/v2-m0-report.md`：M0 报告（§3 数据映射表，M5 用）
  - `docs/tech/v2-m1-channel-gap.md`：M1 渠道差距分析
  - `docs/conventions/file-structure.md`：目录结构与拆分规则（单目录≤10子项）
  - `docs/CODE_STYLE.md`：代码风格与格式化规范

- **自动化与流程**
  - `docs/conventions/pr-automation.md`：PR 自动化状态机与标签规则
  - `AGENTS.md`：本仓库开发约定与质量门槛（测试、i18n、提交规范）

### 经验法则（路由优先级）

1. 先读：`CLAUDE.md` + `.claude/CLAUDE.md`（本文件）
2. 再读：Claude Code 自动记忆（`~/.claude/projects/{project}/memory/*.md`）里的摘要与索引
3. 最后按路由读：`docs/**` 原文（只读需要的章节，不要全量扫）

### 交付约定（必须遵守）

- **安装路径保证生效**：凡是修改会影响运行行为的代码（`src/**` 等），都必须在修改后提供新的 Windows 安装包（`npm run dist:win`）。安装版只运行 `app.asar` 产物，不能靠“复制源码文件”生效。
- **渠道配对兜底**：所有需要配对的渠道（飞书/Lark、Telegram、钉钉、微信等）在「待批准的配对请求」之外，必须提供“手动输入 6 位配对码 → Approve/Reject”的兜底入口，用于 pending 列表为空/事件未推送时的授权。

