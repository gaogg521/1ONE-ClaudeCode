/**
 * Dev restart: kill Electron, remove lockfile, optionally build, spawn electron-vite dev.
 *
 * Usage:
 *   node scripts/restart-dev.mjs              # desktop dev only
 *   node scripts/restart-dev.mjs --build      # build out/ then desktop dev
 *   node scripts/restart-dev.mjs --build --webui
 *   node scripts/restart-dev.mjs --build --webui --remote
 *
 * Env: ONE_RESTART_BUILD=1, ONE_RESTART_WEBUI=1, ONE_RESTART_WEBUI_REMOTE=1
 *
 * @license Apache-2.0
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

const shouldBuild =
  argv.includes('--build') ||
  argv.includes('-b') ||
  process.env.ONE_RESTART_BUILD === '1';
const useWebui = argv.includes('--webui') || process.env.ONE_RESTART_WEBUI === '1';
const useWebuiRemote =
  argv.includes('--remote') || process.env.ONE_RESTART_WEBUI_REMOTE === '1';

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

function runBuild(root, env) {
  const electronViteCli = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
  console.log('[restart] Building main + renderer to out/ (required for LAN WebUI: http://<ip>:25809)...');
  const result = spawnSync(process.execPath, [electronViteCli, 'build'], {
    stdio: 'inherit',
    env,
    cwd: root,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
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

  if (shouldBuild) {
    runBuild(root, env);
  } else if (useWebui || useWebuiRemote) {
    console.warn(
      '[restart] WebUI over LAN serves out/renderer static files. Prefer: npm run restart:webui (includes build).'
    );
  }

  const electronViteCli = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
  const devArgs = ['dev'];
  if (useWebui || useWebuiRemote) {
    devArgs.push('--');
    if (useWebui) {
      devArgs.push('--webui');
    }
    if (useWebuiRemote) {
      devArgs.push('--remote');
    }
  }

  const child = spawn(process.execPath, [electronViteCli, ...devArgs], {
    stdio: 'inherit',
    env,
    cwd: root,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

void main();
