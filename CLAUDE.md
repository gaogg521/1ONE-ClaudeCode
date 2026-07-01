@AGENTS.md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Principles

These principles apply to every project session:

- ✅ **每个项目的缓存复用** — 优先读取已有的记忆摘要、已分析的结构和已生成的结论，不重复扫描已知内容。记忆文件以 Claude Code 自动记忆目录 `~/.claude/projects/{project}/memory/*.md` 为准（可在应用内「记忆管理」绑定项目根目录后读写）。
- ✅ **增量更新** — 只读取、只修改与当前任务直接相关的文件。避免全量重写；有 diff 就用 Edit，有局部改动就定点修改，不重建整个模块。
- ✅ **记忆=摘要+路由，原文=详情** — 记忆里不要堆长文：只写“结论/约束/决策/下一步”与“去哪读原始文档”。需要细节时再按路由去读 `docs/**` 等原文。
- ✅ **AI 记忆最强** — 每次发现新的项目事实（路径、约定、架构决策、用户偏好）立即写入 Claude Code 自动记忆目录的对应 `.md`，并维护一份索引（推荐用 `MEMORY.md` 作为导航入口）。记忆文件是跨会话的唯一持久状态。
- ✅ **成本最低** — 最短路径完成任务：先查记忆，再精准读文件，最后才启动大范围搜索。工具调用数 < 信息需求量；能用 Grep 就不用 Agent；能读10行就不读100行。

## Commands

```bash
# Development
npm start                    # Dev mode (electron-vite dev), hot reload
npm run restart              # Full desktop: clean vite → build → MCP → Electron window (+ WebUI auto-restore)
npm run restart:fast         # Fast: stop → dev only (HMR, no clean/build)
npm run restart:webui        # Headless WebUI only (no desktop window; use browser)
npm run restart:webui:remote # Headless WebUI + --remote (LAN)
npm run webui:prod           # WebUI mode (browser access at localhost:25809)

# Build
npx electron-vite build      # Build all (main + renderer) to out/
npm run build:webui          # Same as electron-vite build (alias)
npm run dist:win             # Packaged installer for Windows

# Test
npm run test                 # vitest unit tests
npm run test:integration     # Integration tests
npm run lint                 # oxlint
npm run lint:fix             # Auto-fix lint issues
```

**Important**: Always use `npm run restart` (not `npm start`) when an instance is already running — it kills Electron, electron-vite, and dev ports (5173–5185, 9230, 25809), then clears the lockfile at `%APPDATA%\1OneClaudeCode-Dev\lockfile`. **Ctrl+C** in the restart terminal stops the whole dev tree. If the terminal is stuck, open another window and run `npm run stop:dev`.

**WebUI / LAN browser testing**: LAN serves **built** assets from `out/renderer/`. **`npm run restart`** rebuilds `out/` and opens the **desktop app**; WebUI HTTP restores from settings. Use **`npm run restart:webui`** for headless server only (no window). Use **`npm run restart:fast`** for quick HMR only.

## Architecture

### Process Separation

Three Electron processes with strict boundaries:

- **Main process** (`src/index.ts`) — App lifecycle, window management, spawns workers
- **Renderer** (`src/renderer/`) — React + HashRouter UI, no direct Node access
- **Workers** (`src/process/worker/`) — Isolated subprocesses per agent type (gemini, acp, aionrs, openclaw-gateway, nanobot, remote)

### IPC Bridge Pattern

All renderer↔main communication goes through a centralized bridge:

```
src/common/adapter/ipcBridge.ts    ← declares all channels with types
src/process/bridge/index.ts        ← registers all provider implementations
src/process/bridge/{feature}Bridge.ts  ← per-feature handler
```

`bridge.buildProvider<Response, Input>('channel.name')` declares a typed RPC channel. In the main process, call `.provider(async (input) => ...)` to implement it. In the renderer, call `.invoke(input)` to call it.

### Agent Worker Pattern

`src/process/task/workerTaskManagerSingleton.ts` — `AgentFactory` maps conversation types to manager classes. Each manager spawns a worker subprocess (`out/main/{agentName}.js`). Workers communicate via `pipe` (forkTask pattern).

To add a new agent type:
1. Create `src/process/worker/{name}.ts` as the worker entry
2. Create `src/process/task/{Name}Manager.ts`  
3. Register in `workerTaskManagerSingleton.ts`
4. Add worker entry in `electron.vite.config.ts` `rollupOptions.input`

### Storage

- **SQLite** via `better-sqlite3` — conversations, messages, teams (at `%APPDATA%\1OneClaudeCode-Dev\1one\1one.db`)
- **ConfigStorage** (`@office-ai/platform`) — typed key-value for settings (model config, MCP servers, agents, etc.), stored in `one-config.txt` (base64-encoded JSON) under `%APPDATA%\1OneClaudeCode-Dev\config\`
- **Memory files** — `~/.claude/projects/{project}/memory/*.md` for Claude Code auto-memory

### Key Directories

```
src/process/
  agent/          # Per-agent logic (acp, gemini, aionrs, openclaw, nanobot)
  bridge/         # IPC bridge implementations
  services/       # Database repos, i18n, MCP protocol, document parsing
  task/           # Agent managers + WorkerTaskManager
  team/           # Multi-agent team session service
  extensions/     # Extension registry, lifecycle, sandboxed workers
  resources/      # Bundled assets: assistant presets, skills, builtin MCPs

src/renderer/
  pages/          # Route-level page components
  components/     # Shared UI components (layout, settings modals, agent cards)
  hooks/          # Custom React hooks (organized by domain: mcp/, agent/, chat/)
  utils/          # Pure utilities (model/, ui/, workspace/, platform)
```

### Settings & Config Pages

Settings pages use `ConfigStorage.get/set('key')` directly from the renderer. The settings route is `/settings/{tab}`. Tabs are registered in `SettingsSider.tsx` via `BUILTIN_TAB_IDS`.

### Adding IPC Methods

1. Add declaration in `src/common/adapter/ipcBridge.ts`
2. Create/update `src/process/bridge/{feature}Bridge.ts`
3. Register with `initAllBridges()` in `src/process/bridge/index.ts`

### Build Notes

- `externalizeDepsPlugin` externalizes all `node_modules` from the main bundle (except `fix-path`)
- The renderer bundle uses manual chunk splitting — keep vendor boundaries clean
- Path aliases: `@` → `src/`, `@process` → `src/process/`, `@renderer` → `src/renderer/`, `@worker` → `src/process/worker/`
- Node.js v22.21.1 is used (supports `require()` of synchronous ESM modules)

### 主进程 console 禁令（Critical）

**禁止在 `src/process/`、`src/index.ts`、`src/preload.ts`、`src/server.ts` 里用 `console.log/warn/error`。**

`@office-ai/platform` patch 了 `console.*`,让它在主进程触发 `bridge.adapter.emit('officeai-logger')` → `win.webContents.send` × N 窗口 + `broadcastToAll` WebSocket 广播。在同步调用栈里(IPC handler、Express 中间件、任何 `bridge.adapter.emit` 调用栈)用 `console.*`,会阻塞主进程 event loop。

**高发场景**:
- IPC handler 里每个 `invoke` 触发的 console
- Express 中间件里每个 HTTP 请求触发的 console(`requestLoggingMiddleware`、Vite 代理错误、errorHandler)
- aionrs worker fork 链路上的 console

**后果**:浏览器打开 WebUI 加载几十个静态资源 / 客户端模式轮询 / aionrs MISS 路径 → 每次触发 console → 几十次同步 `win.webContents.send` → 主进程冻死(Windows "未响应")。

**替代方案**:用 `appendFileSync` 写文件日志(同步、安全、不经 bridge)。示例见 `AuthMiddleware.requestLoggingMiddleware`(写 `logs/webui-requests.log`)。

**Lint 规则**:`.oxlintrc.json` 已对 `src/process/` 等目录开 `no-console: warn`。新增 console 调用会触发 lint warning,请改用文件日志。

**渲染进程(`src/renderer/`)的 console.log 是安全的** — 走浏览器原生 console,不触发主进程 bridge patch。但建议也少用,避免噪音。

**历史教训**:这个问题曾导致 4 轮卡死排查(`4b9453c`、`e332557`、`2c98728`、ViteProxy error),每次都以为清干净了,结果还有漏网的。加 lint 规则后从源头拦截。

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
