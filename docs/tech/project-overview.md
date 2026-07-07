# 1ONE ClaudeCode 项目全景（新 Agent Onboarding）

> **全新 AI 会话读这一份 + `MEMORY.md` 索引就能理解项目。** 最后更新：2026-07-07。

## 一句话项目定义

**1ONE ClaudeCode** 是 Claude Code（Anthropic 官方 CLI）的可视化控制中心——用 Electron + React 把 Claude Code 的原生能力（agent / skills / MCP / tools / 记忆）包装成桌面应用 + WebUI，并 fork 上游 AionUi 的前端壳 + AionCore（Rust）后端，叠加企业版治理（SSO / LDAP / 多租户 / 协作看板）。

## 仓库分布（三仓协同）

| 仓库 | 远端 | 本地路径 | 角色 | 分支 |
|---|---|---|---|---|
| **AionUi fork** | `gaogg521/AionUi` | `D:\aionui-m0\AionUi` | 前端壳 + Electron 主进程（fork 上游 iOfficeAI/AionUi，rebrand 为 1ONE Code） | `one-main` |
| **AionCore fork** | `gaogg521/AionCore` | `D:\aionui-m0\AionCore` | Rust 后端（fork 上游 iOfficeAI/AionCore，叠加 `one-*` crates：one-org / one-sso / one-employee / one-devops） | `one-main` |
| **1ONE-ClaudeCode** | `gaogg521/1ONE-ClaudeCode` | `D:\1one-command` | **文档仓 + 老系统代码保留**（迁移参考 + 接手文档 + memory） | `main` |

⚠️ `/d/AionUi` 是上游 iOfficeAI main，**不是 fork**——别搞混。fork 在 `D:\aionui-m0\AionUi`。

## 架构（三层）

```
┌─────────────────────────────────────────┐
│  Electron Renderer (React + HashRouter) │  ← AionUi fork packages/desktop/src/renderer
│  - 页面 / 组件 / hooks / IPC 调用方       │
├─────────────────────────────────────────┤
│  Electron Main + Workers                │  ← AionUi fork packages/desktop/src/process
│  - IPC bridge / worker 子进程 / 文件 IO  │  (memoryBridge / systemSettings / dialog 等)
├─────────────────────────────────────────┤
│  AionCore (Rust, axum)                  │  ← AionCore fork crates/
│  - HTTP API / WebSocket / aionrs agent  │  (aionui-app + one-org/one-sso/one-devops)
│  - SQLite / 文件系统 / MCP / skills      │
└─────────────────────────────────────────┘
```

**进程边界**（不可越界）：
- Renderer → 无 Node API，只能走 IPC bridge
- Main → 有 Electron + Node，无 DOM
- Worker → fork 子进程，无 Electron

**IPC 模式**：
- `bridge.buildProvider` → Electron IPC（桌面本地：dialog / shell / window / memory 文件操作）
- `httpGet/Post/Put/Delete` → HTTP 到 aioncore（业务 API：conversations / assistants / teams / providers）
- `wsEmitter` → WebSocket 实时事件

## 当前进度（2026-07-07 第二十一轮）

### 已完成 ✅
- **一期 M0-M5 全部完成**：fork 选型 / 数据迁移 / 打包链 / 灰度约定（详见 `docs/tech/v2-m5-migration.md`）
- **二期主线全部完成**：A1 编排三层（assign/breakdown/autopilot + 团队共享）/ A2 RAG / A3 注册表 UI / A4 milestones+test plans+CI / B2 自建 agent 迁移 / B4 LDAP UI / B3 rebrand 1ONE Code
- **第二十一轮 4 任务完成**（commit `aa5241b` → `7a66d28`，已 push fork one-main）：
  - #23 移植记忆管理页到 fork（IPC + memoryBridge + 页面 + 侧栏入口 + i18n）
  - #24 客户端加入引导 + 超管 i18n 补全
  - #15 ACP bug 静态分析（`docs/guides/acp-aioncli-tool-call-failure-analysis.md`）
  - #18 Team Mode 验证（`docs/guides/team-mode-verification.md`）
- **当前安装包**：`D:\aionui-m0\AionUi\out\1ONE Code-2.1.31-win-x64.exe`（2.1.30 保留）

### 待用户输入 ⏳
1. **#15 ACP bug 复现定性**——需换支持 function-calling 的模型（GPT-4o / Claude 3.5 / Gemini 1.5 Pro / Qwen-Max / DeepSeek-Chat）在同 provider 下复现，确认是模型能力问题还是 fork bug
2. **#18 Team Mode 运行时 E2E**——代码层通过，多用户场景卡 D5
3. **钉钉 / 企业微信 SSO**（T2）——用户 2026-07-06 明确暂缓，等凭据
4. **C 组跨用户活体 E2E**（T3）——卡 D5 多用户环境
5. **A4 value stream / A1 L3 backfill / A2 RAG 三增强**（T4-T6）——需求驱动，非阻塞

## 后续迭代方向

按优先级：
1. **用户实测 2.1.31 反馈** → 修 bug / 定性 #15
2. **#15 定性后**：改 `modelCapabilities.ts`（加 glm）或 `factory/aionrs.rs`（默认容错轮数 + path 非空自动 is_full_url）
3. **#18 多用户 E2E**（等 D5 环境）→ 修 `#3428 behind_active_turn` / `#3389 重启后无法发消息` / `#3525 mcpCapabilities.stdio`
4. **钉钉 / 企微 SSO**（等凭据）
5. **上游同步**：fork 落后上游 ~100 提交，需定期 `git fetch upstream` 评估 cherry-pick（无共同祖先，merge 会大面积冲突）

## 必读文档（按优先级，新会话第一次读这 4 份就够）

1. **本文件** — 项目全景
2. **`docs/tech/v2-handoff-quickstart.md`** — 接手快速入门（当前状态 + 命令 + 踩坑 + 接手 prompt 模板）
3. **`docs/tech/v2-audit-and-open-items.md`** — 剩余待办 + BUG 扫描 + 三审计（"还有什么没做"唯一入口）
4. **`.claude/CLAUDE.md`** — 项目路由入口（按任务匹配读 architecture / m5 / phase2 等）

按需再读：
- `docs/tech/architecture.md` — 三进程架构详解
- `docs/tech/v2-architecture-comparison.md` — 选项 A 决策文档（M0-M5 路线图）
- `docs/tech/v2-m5-migration.md` — 数据迁移 / 打包 / 灰度全记录
- `docs/tech/v2-phase2-plan.md` — 二期排期（前置决策 D1-D5 + A/B/C 分组 + 三波次）
- `CONTEXT.md` 最底部那一轮 — 权威未完成项清单

## 常用命令

```bash
# fork AionUi 前端
cd D:/aionui-m0/AionUi
bunx tsc --noEmit                      # typecheck
bunx oxlint <paths>                    # lint
bun run dev                            # 桌面 dev（Electron+React HMR）
AIONUI_BACKEND_LOCAL_PATH='D:\aionui-m0\AionCore\target\release\aioncore.exe' bun run dist:win  # 出 Windows 安装包

# fork AionCore 后端
cd D:/aionui-m0/AionCore
export PATH="/c/Users/allenzhao/.cargo/bin:$PATH"
cargo build -p aionui-app --release    # 增量 ~50s
cargo test -p one-sso -p one-org -p one-employee  # 29/29

# 启服务冒烟（--local 免认证）
./target/release/aioncore.exe --local --port 25912 \
  --data-dir /d/aionui-m0/m2-smoke --log-dir /d/aionui-m0/m2-smoke/logs --work-dir /d/aionui-m0/m2-smoke/work

# 1one-command 文档仓（这里只改文档 + memory）
cd D:/1one-command
git add docs/ && git commit -m "docs(...): ..."
```

## 关键约束（踩坑，不可再犯）

1. **主进程 console.* 禁令**：`src/process/` / `src/index.ts` 禁用 `console.*`（触发 bridge.emit 广播 + electron-log 同步写盘 → 阻塞 event loop）。用异步 `appendFile` 写文件日志。
2. **打包前必须 bump version**：`package.json` patch+1 并 commit push，再 `dist:win`。
3. **打新包不许删旧 .exe**（一个都不行），其他中间产物随便删。
4. **测试走桌面端不走 WebUI**：`npm run restart`（WebUI PATH 不全导致 claude CLI not found）。
5. **改动影响运行行为（src/**）必须打新 Windows 安装包**——安装版只运行 `app.asar` 产物。
6. **永远在 main 分支开发提交**，不建功能分支。
7. **commit 信息全部用中文**，格式 `<type>(<scope>): <subject>`，不加 AI 签名。
8. **使用中文交流**，代码仍用英文。
9. **fork 的 aioncoreVersion 必须指 fork 构建**（含 one-* crates），绝不能用上游 v0.1.42（无 fork crates）。
10. **HttpOnly cookie 前端读不到**——判断登录态用 AuthContext 的 `status`，不读 `document.cookie`。
11. **所有 fetch 必须有 `AbortSignal.timeout()` 兜底**。
12. **ConfigStorage.get() 是渲染层专用**，主进程用 `ProcessConfig`。

详见 `docs/tech/v2-handoff-quickstart.md`「关键约束」段 + `CLAUDE.md`「2026-07-01 踩坑总结」。

## 工作模式

- **记忆=摘要+路由**：memory 文件只放结论 + 路由，原文留仓库文档。需要细节按路由读 `docs/**`。
- **增量更新**：只读改与当前任务直接相关的文件，避免全量重写。
- **先查记忆，再精准读文件，最后才大范围搜索**：工具调用数 < 信息需求量。

## 新会话开场 prompt 模板

```
读 D:\1one-command\docs\tech\project-overview.md（项目全景），
再读 docs/tech/v2-handoff-quickstart.md 的「接手续作」段。
我在做 [当前任务]。按 .claude/CLAUDE.md 的路由按需读其他文档。
```
