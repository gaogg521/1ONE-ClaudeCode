## 项目路由入口（Memory Routing）

本文件是**项目级路由入口**：只放“读什么、什么时候读、去哪里找”，不放长篇原文。

### 记忆策略（必须遵守）

- **记忆=摘要+路由**：把结论沉淀到 Claude Code 自动记忆（`~/.claude/projects/{project}/memory/*.md`），把原文留在仓库文档里。
- **原文=详情**：需要细节时，按下面的路由去读 `docs/**` 等原始文档。

### 关键文档（建议按任务先读）

- **开发与运行**
  - `docs/development.md`：本地开发、常用脚本、环境说明
  - `docs/WEBUI_GUIDE.md`：WebUI 使用与注意事项
  - `docs/SERVER_DEPLOY_GUIDE.md`：服务端部署（如果涉及）

- **架构与约束**
  - `docs/tech/architecture.md`：三进程架构、边界、IPC 约束
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

