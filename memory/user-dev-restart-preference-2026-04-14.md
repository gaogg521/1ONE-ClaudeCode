# User preference: auto-restart after dev changes

- **Preference**: After the agent finishes code changes that affect the Electron/Vite dev app, **automatically restart** the dev instance so the user does not need to do it manually.
- **Command (repo root) — 优先用 npm**：**`npm run restart`**（`package.json` 中为 `npx tsx scripts/restart-dev.ts`，**不依赖全局 bun**）。会清锁并结束旧实例再启动。
- **不要用 `bun run restart` 作为默认**，除非在同一 shell 中已确认 **`npm` 不可用**（例如 `npm` 不在 PATH）且用户未提供其他方式时，再作为备选并说明原因。
- **Agent 环境说明**：若 Cursor 子进程里 `npm` 未加入 PATH，可用 **`& "$env:ProgramFiles\nodejs\npm.cmd" run restart`**（仍是 npm 入口）。注意：`package.json` 的 `restart` 脚本当前为 **`bun scripts/restart-dev.ts`**，npm 拉起后仍会依赖本机 PATH 中的 **bun**；若 agent 里无 bun，需在用户本机终端执行 `npm run restart`，或后续把脚本改为 `npx tsx` / `node` 以摆脱对 bun 的依赖。
