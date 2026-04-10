@AGENTS.md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Principles

These principles apply to every project session:

- ✅ **每个项目的缓存复用** — 优先读取已有的记忆文件、已分析的结构和已生成的结论，不重复扫描已知内容。在 `memory/` 目录里记录的内容视为可信事实直接使用。
- ✅ **增量更新** — 只读取、只修改与当前任务直接相关的文件。避免全量重写；有 diff 就用 Edit，有局部改动就定点修改，不重建整个模块。
- ✅ **AI 记忆最强** — 每次发现新的项目事实（路径、约定、架构决策、用户偏好）立即写入 `memory/` 对应文件并更新 `MEMORY.md` 索引，不等到会话结束。记忆文件是跨会话的唯一持久状态。
- ✅ **成本最低** — 最短路径完成任务：先查记忆，再精准读文件，最后才启动大范围搜索。工具调用数 < 信息需求量；能用 Grep 就不用 Agent；能读10行就不读100行。

## Commands

```bash
# Development
npm start                    # Dev mode (electron-vite dev), hot reload
npm run restart              # Kill existing instance + clear lockfile + restart
npm run webui:prod           # WebUI mode (browser access at localhost:25809)

# Build
npx electron-vite build      # Build all (main + renderer) to out/
npm run dist:win             # Packaged installer for Windows

# Test
npm run test                 # vitest unit tests
npm run test:integration     # Integration tests
npm run lint                 # oxlint
npm run lint:fix             # Auto-fix lint issues
```

**Important**: Always use `npm run restart` (not `npm start`) when an instance is already running — it handles the lockfile at `%APPDATA%\1OneClaudeCode-Dev\lockfile`.

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
