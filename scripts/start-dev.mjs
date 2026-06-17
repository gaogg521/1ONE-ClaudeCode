/**
 * npm run start — kill stale Electron/Vite zombies, clear lockfile, then electron-vite dev.
 * Raw Vite without cleanup: npm run start:raw
 *
 * @license Apache-2.0
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const restartScript = path.join(__dirname, 'restart-dev.mjs');

const result = spawnSync(process.execPath, [restartScript, '--start'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  env: process.env,
});

process.exit(result.status ?? 1);
