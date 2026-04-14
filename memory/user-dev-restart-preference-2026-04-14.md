# User preference: auto-restart after dev changes

- **Preference**: After the agent finishes code changes that affect the Electron/Vite dev app, **automatically restart** the dev instance so the user does not need to do it manually.
- **Command** (repo root): `bun run restart` — same as `npm run restart` per `package.json` (`bun scripts/restart-dev.ts`). Clears lockfile and kills existing instance before starting.
- **Agent environment note**: In some Cursor/sandbox shells on Windows, `npm` may not be on `PATH`; use **`bun run restart`** from `d:\1one-command` when `npm` fails.
