# 2026-04-14 会话备忘：重启脚本、白屏、API 报错、Windows 示例包

## 开发重启（npm 优先）

- `package.json`：`"restart": "node scripts/restart-dev.mjs"`（勿再使用已删除的 `scripts/restart-dev.ts`）。
- `scripts/restart-dev.mjs`：用 `process.execPath` 执行 `node_modules/electron-vite/bin/electron-vite.js dev`，避免 Windows 下 Bun 在 `node_modules/.bin` 生成的 `electron-vite.exe` 要求 PATH 中必须有 `bun`。
- 用户操作首选：**`npm run restart`**。若终端仍打印 `bun scripts/restart-dev.ts`，说明本地 `package.json` 与仓库未同步。
- 完整构建脚本 `scripts/build-with-builder.js`：已改为 **`npx --no-install electron-vite build`** 与 **`npx --no-install electron-builder …`**（仅用本地 `node_modules`，不依赖全局 bun）。

## 白屏（开发模式）

- 主进程在 `!app.isPackaged && ELECTRON_RENDERER_URL` 时 `loadURL`；Vite 端口被占用时会换端口（如 5173→5174），需与终端里 dev server URL 一致。

## 「不稳定」与模型报错

- 聊天区出现 **502** 且内层 **400**、`The requested operation is unsupported` 时，多为 **上游模型 / 网关 / API Key 与 Base URL 配置** 问题，不等同于桌面端随机崩溃。

## Windows 安装包与「示例」功能是否进包

- **任务看板**：路由 `#/tasks`（`src/renderer/pages/tasks`），随 renderer 打进 asar，无需单独资源。
- **Hook 监控**：路由 `#/hooks`（`src/renderer/pages/hooks`），同上。
- **MCP 服务**：路由 `#/mcp`；默认 MCP 列表与内置图片 MCP 由 `initStorage`（`getDefaultMcpServers`、`ensureBuiltinMcpServers`）在首次运行时写入配置；打包时 **`node scripts/build-mcp-servers.js`** 生成 `out/main/builtin-mcp-image-gen.js`，`electron-builder.yml` 的 `asarUnpack` 已包含该文件供外部 `node` 进程执行。
- **打 Windows 包命令**：`npm run dist:win`（即 `node scripts/build-with-builder.js auto --win`）。产物在仓库根目录 **`out/`**（NSIS 安装包 + zip 等，见 `electron-builder.yml` 的 `artifactName`）。

## 给他人做演示时的提示

- 安装后左侧导航即可打开 **任务看板 / Hook 监控 / MCP 服务**；内置 MCP 需在设置中按需启用并配置模型密钥。

## 打包版「第二条消息一直转圈」（Gemini / MCP 刷新）

- **原因**：`GeminiAgentManager.refreshWorkerIfMcpChanged()` 在 MCP 指纹变化时会 `kill()` 子进程；`ForkTask.kill()` 原先**未**将 `this.fcp` 置空，且 `start()` **不会**重新 `fork`。下一条消息仍向已退出子进程 `postMessage`，`postMessagePromise('start')` 永不 resolve，UI 表现为加载中无回复。
- **修复**（`src/process/worker/fork/ForkTask.ts`）：`kill()` 后 `this.fcp = undefined`；`start()` 在 `!this.fcp` 时调用 `init()` 重新拉起 worker；`init()` 开头若已有 `fcp` 则直接返回；子进程 `complete`/`error` 时改为 `this.kill()` 以统一清理；`process.on('exit')` 改到 `init()` 注册，避免重复与 respawn 后丢失清理。
- **补充**（`GeminiAgentManager.computeMcpFingerprint`）：指纹**不再包含** MCP 的 `status` 字段，避免首条消息后仅「连接状态」变化就反复 `kill`/重启 worker（新包若仍偶发卡顿，可再打一次包含此项的包）。
- **Gemini 转圈（前端）**（`useGeminiMessage.ts`）：收到 `type === 'error'` 时原先只清 `waitingResponse`，未清 `streamRunning` / `hasActiveTools`，`running` 仍为 true 会无限转圈；已改为与 `finish` 一致全部复位。工具从 active→inactive 时仅在 `streamRunningRef` 仍为 true 时才把 `waitingResponse` 置 true，避免流已结束却仍进入「假等待」。
