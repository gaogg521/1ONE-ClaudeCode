/**
 * Dev restart: kill Electron, remove lockfile, spawn electron-vite dev.
 * Plain Node ESM so `npm run restart` does not require global bun or tsx on PATH.
 * @license Apache-2.0
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryUnlink(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function killElectron() {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/F', '/IM', 'electron.exe', '/T'], { stdio: 'ignore' });
    return;
  }
  try {
    spawnSync('pkill', ['-f', 'electron'], { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

function getLockfilePath() {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  return path.join(appData, '1OneClaudeCode-Dev', 'lockfile');
}

async function main() {
  killElectron();
  await sleep(300);

  const lockfilePath = getLockfilePath();
  if (lockfilePath) {
    tryUnlink(lockfilePath);
  }

  const root = path.join(__dirname, '..');
  const localBin = path.join(root, 'node_modules', '.bin');
  const sep = process.platform === 'win32' ? ';' : ':';
  const env = {
    ...process.env,
    PATH: `${localBin}${sep}${process.env.PATH || ''}`,
  };

  // Bun's installer drops `electron-vite.exe` shims in `.bin` that require `bun` on PATH.
  // Always run the published Node CLI entry so `npm run restart` works with only Node/npm.
  const electronViteCli = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
  const child = spawn(process.execPath, [electronViteCli, 'dev'], {
    stdio: 'inherit',
    env,
    cwd: root,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

void main();
