/**
 * Dev-mode restart: re-run electron-vite dev instead of relaunching a stale out/ bundle.
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { electronApp as app } from '@/common/electronSafe';

const DEV_LOCKFILE_DIR = '1OneClaudeCode-Dev';

export function resolveDevRestartScript(root = process.cwd()): string {
  return path.join(root, 'scripts', 'restart-dev.mjs');
}

export function resolveNodeExecutable(): string {
  if (process.env.npm_node_execpath) {
    return process.env.npm_node_execpath;
  }
  return process.platform === 'win32' ? 'node.exe' : 'node';
}

export async function clearDevLockfile(): Promise<void> {
  const lockfile = path.join(app.getPath('appData'), DEV_LOCKFILE_DIR, 'lockfile');
  await fs.rm(lockfile, { force: true });
}

export function spawnDevRestartScript(root = process.cwd()): boolean {
  const scriptPath = resolveDevRestartScript(root);
  try {
    const child = spawn(resolveNodeExecutable(), [scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: process.env,
      cwd: root,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export function scheduleApplicationRestart(): void {
  const isDev = !app.isPackaged;
  if (isDev) {
    void clearDevLockfile();
    const spawned = spawnDevRestartScript();
    if (!spawned) {
      app.relaunch();
    }
    setTimeout(() => app.exit(0), 150);
    return;
  }

  app.relaunch();
  app.exit(0);
}
