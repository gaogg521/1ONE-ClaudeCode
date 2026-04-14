import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function killElectron(): void {
  if (process.platform === 'win32') {
    // taskkill exits non-zero when process doesn't exist; ignore that.
    spawnSync('taskkill', ['/F', '/IM', 'electron.exe', '/T'], { stdio: 'ignore' });
    return;
  }

  // Best-effort for macOS/Linux dev envs.
  // (No-op if pkill isn't available.)
  try {
    spawnSync('pkill', ['-f', 'electron'], { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

function getLockfilePath(): string | null {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  return path.join(appData, '1OneClaudeCode-Dev', 'lockfile');
}

async function main(): Promise<void> {
  killElectron();
  // Give Windows a moment to release file handles.
  await sleep(300);

  const lockfilePath = getLockfilePath();
  if (lockfilePath) {
    tryUnlink(lockfilePath);
  }

  const child = spawn('electron-vite', ['dev'], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

void main();

