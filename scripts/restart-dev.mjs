/**
 * Dev restart — default is a full cycle: stop app, clear Vite cache, rebuild, start with WebUI.
 *
 * Usage:
 *   node scripts/restart-dev.mjs              # full desktop + build (npm run restart)
 *   node scripts/restart-dev.mjs --fast       # kill + dev only (npm run restart:fast)
 *   node scripts/restart-dev.mjs --webui      # headless: WebUI server only, no window
 *   node scripts/restart-dev.mjs --webui --remote   # headless + LAN (restart:webui:remote)
 *   node scripts/restart-dev.mjs --stop-only        # kill zombies only (npm run stop:dev)
 *
 * Ctrl+C / SIGTERM kills the electron-vite process tree (Windows: taskkill /T).
 *
 * @license Apache-2.0
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { killWindowsAppProcesses } from './packagedExecutable.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);

const isFast =
  argv.includes('--fast') ||
  argv.includes('--no-build') ||
  process.env.ONE_RESTART_FAST === '1';
const useWebuiOnly = argv.includes('--webui') || process.env.ONE_RESTART_WEBUI === '1';
const useWebuiRemote =
  argv.includes('--remote') || process.env.ONE_RESTART_WEBUI_REMOTE === '1';
const stopOnly = argv.includes('--stop-only') || process.env.ONE_STOP_DEV === '1';

/** Full restart: clean + build + desktop dev (window + auto WebUI restore). Fast: HMR dev only. */
const isFull = !isFast;

const DEV_LISTEN_PORTS = [
  5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 5181, 5182, 5183, 5184, 5185, 9230, 25809, 25810,
];

let devChild = null;
let shuttingDown = false;
const projectRoot = path.join(__dirname, '..');

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

function killProcessTree(pid) {
  if (!pid || pid <= 0) {
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
}

function killElectron() {
  if (process.platform === 'win32') {
    killWindowsAppProcesses();
    return;
  }
  try {
    spawnSync('pkill', ['-f', 'electron'], { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

function escapePsSingleQuoted(value) {
  return value.replace(/'/g, "''");
}

/** Kill node/npm trees tied to this repo (electron-vite, restart, MCP build, etc.). */
function killNodeDevScripts() {
  const selfPid = process.pid;
  if (process.platform === 'win32') {
    const rootEscaped = escapePsSingleQuoted(projectRoot);
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$exclude = @(${selfPid}); $root = '${rootEscaped}'; $targets = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $exclude -notcontains $_.ProcessId -and ( $_.CommandLine -like "*$root*" -or $_.CommandLine -like '*electron-vite*' -or $_.CommandLine -like '*restart-dev.mjs*' -or $_.CommandLine -like '*ensure-mcp-after-dev*' -or $_.CommandLine -like '*build-mcp-servers*' ) }; foreach ($p in $targets) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ],
      { stdio: 'ignore' }
    );
    return;
  }
  try {
    spawnSync('pkill', ['-f', 'electron-vite'], { stdio: 'ignore' });
    spawnSync('pkill', ['-f', 'restart-dev.mjs'], { stdio: 'ignore' });
    spawnSync('pkill', ['-f', projectRoot], { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

function reportDevProcessStatus() {
  if (process.platform !== 'win32') {
    return;
  }
  const rootEscaped = escapePsSingleQuoted(projectRoot);
  const portList = DEV_LISTEN_PORTS.join(',');
  const psVerify = [
    `$root = '${rootEscaped}'`,
    `$ports = @(${portList})`,
    `$electron = @(Get-Process electron -ErrorAction SilentlyContinue).Count`,
    `$listen = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }).Count`,
    `$repoNodes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$root*" })`,
    `Write-Host "[stop] verify: electron=$electron dev_listen_ports=$listen repo_node=$($repoNodes.Count)"`,
    `if ($repoNodes.Count -gt 0) { Write-Host '[stop] remaining repo node (should be 0):'; $repoNodes | ForEach-Object { Write-Host ('  PID ' + $_.ProcessId + ' ' + $_.CommandLine.Substring(0, [Math]::Min(120, $_.CommandLine.Length))) } } else { Write-Host '[stop] repo dev stack stopped. Task Manager may still show Cursor/CodeGraph/other Node - that is normal.' }`,
  ].join('; ');
  spawnSync('powershell', ['-NoProfile', '-Command', psVerify], { stdio: 'inherit' });
}

/** Free stale Vite/WebUI/CDP listeners so the new instance gets 5173 and a single Electron window. */
function killDevListenPorts() {
  console.log(`[restart] Releasing dev ports if held: ${DEV_LISTEN_PORTS.join(', ')}`);
  if (process.platform === 'win32') {
    const portList = DEV_LISTEN_PORTS.join(',');
    spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$ports = @(${portList}); foreach ($p in $ports) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }`,
      ],
      { stdio: 'ignore' }
    );
    return;
  }
  for (const port of DEV_LISTEN_PORTS) {
    try {
      spawnSync('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
    } catch {
      // ignore
    }
  }
}

function killStaleDevProcesses() {
  console.log('[restart] Stopping Electron + stale dev processes...');
  killElectron();
  killNodeDevScripts();
  killDevListenPorts();
  // Second pass: child node processes often outlive the parent on Windows.
  killNodeDevScripts();
  killDevListenPorts();
}

function requestShutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`\n[restart] ${signal} — stopping dev process tree...`);
  if (devChild?.pid) {
    killProcessTree(devChild.pid);
  }
  killStaleDevProcesses();
  const lockfilePath = getLockfilePath();
  if (lockfilePath) {
    tryUnlink(lockfilePath);
  }
  setTimeout(() => {
    process.exit(signal === 'SIGINT' ? 130 : 0);
  }, 400);
}

function registerShutdownHooks() {
  const onSignal = (signal) => requestShutdown(signal);
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  if (process.platform === 'win32') {
    process.once('SIGBREAK', onSignal);
  }
}

function getLockfilePath() {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  return path.join(appData, '1OneClaudeCode-Dev', 'lockfile');
}

function runNodeScript(root, env, scriptName, scriptArgs = []) {
  const scriptPath = path.join(root, 'scripts', scriptName);
  if (!fs.existsSync(scriptPath)) {
    console.warn(`[restart] Skip missing script: ${scriptName}`);
    return 0;
  }
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    stdio: 'inherit',
    env,
    cwd: root,
  });
  return result.status ?? 1;
}

function runElectronVite(root, env, args) {
  const electronViteCli = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
  const result = spawnSync(process.execPath, [electronViteCli, ...args], {
    stdio: 'inherit',
    env,
    cwd: root,
  });
  return result.status ?? 1;
}

function runDevCacheClean(root, env, { vite = true, electron = true } = {}) {
  const args = [];
  if (vite) args.push('--vite');
  if (electron) args.push('--electron');
  console.log(
    `[restart] Cleaning dev caches (${args.join(', ') || 'none'}) — drops stale Vite + Electron Chromium chunks`
  );
  const status = runNodeScript(root, env, 'clean-dev-caches.mjs', args);
  if (status !== 0) {
    process.exit(status);
  }
}

function runFullBuild(root, env) {
  console.log('[restart] Building main + preload + renderer + workers → out/ ...');
  const status = runElectronVite(root, env, ['build']);
  if (status !== 0) {
    process.exit(status);
  }
}

function runMcpBundles(root, env) {
  console.log('[restart] Building self-contained builtin MCP bundles (after out/ build)...');
  const status = runNodeScript(root, env, 'build-mcp-servers.js');
  if (status !== 0) {
    process.exit(status);
  }
}

function startElectronViteDev(root, env, devArgs) {
  const electronViteCli = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
  const child = spawn(process.execPath, [electronViteCli, ...devArgs], {
    stdio: 'inherit',
    env,
    cwd: root,
    detached: process.platform !== 'win32',
    windowsHide: false,
  });
  devChild = child;

  child.on('exit', (code, sig) => {
    if (shuttingDown) {
      return;
    }
    if (sig) {
      console.log(`[restart] electron-vite exited (${sig})`);
    }
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error('[restart] Failed to start electron-vite:', error);
    process.exit(1);
  });
}

async function main() {
  registerShutdownHooks();

  const root = projectRoot;
  const localBin = path.join(root, 'node_modules', '.bin');
  const sep = process.platform === 'win32' ? ';' : ':';
  const env = {
    ...process.env,
    PATH: `${localBin}${sep}${process.env.PATH || ''}`,
    // Dev desktop: auto-open DevTools so white-screen / Vite errors are visible without Settings UI.
    ONE_OPEN_DEVTOOLS: process.env.ONE_OPEN_DEVTOOLS ?? '1',
  };

  if (stopOnly) {
    console.log('[stop] stop-only: killing Electron / electron-vite / dev ports (will NOT start dev)');
  } else if (isFull) {
    if (useWebuiOnly) {
      console.log(
        '[restart] Full WebUI-only restart: no desktop window — open http://localhost:25809 in browser'
      );
    } else {
      console.log('[restart] Full desktop restart: stop → clean vite cache → build → MCP → Electron window');
    }
  } else {
    console.log('[restart] Fast restart: stop → dev (no clean/build)');
  }

  if (!stopOnly) {
    console.log('[restart] Ctrl+C 会结束 Electron、Vite 及 electron-vite 相关 node 进程');
  }

  killStaleDevProcesses();
  await sleep(800);

  const lockfilePath = getLockfilePath();
  if (lockfilePath) {
    tryUnlink(lockfilePath);
  }

  if (stopOnly) {
    reportDevProcessStatus();
    console.log('[stop] done: no dev server started. Use ONE terminal: npm run restart');
    return;
  }

  if (isFull) {
    runDevCacheClean(root, env, { vite: true, electron: true });
    runFullBuild(root, env);
    runMcpBundles(root, env);
    if (!useWebuiOnly) {
      // Full restart already built out/renderer — load it directly to avoid Vite cold-compile white screen.
      env.ONE_DEV_LOAD_BUILT_RENDERER = '1';
      console.log('[restart] Desktop will load out/renderer (ONE_DEV_LOAD_BUILT_RENDERER=1, skips Vite for UI)');
    }
  } else {
    runDevCacheClean(root, env, { vite: true, electron: true });
    const mcpBuildScript = path.join(root, 'scripts', 'build-mcp-servers.js');
    if (fs.existsSync(mcpBuildScript)) {
      runMcpBundles(root, env);
    }
  }

  const devArgs = ['dev'];
  if (useWebuiOnly) {
    devArgs.push('--', '--webui');
    if (useWebuiRemote) {
      devArgs.push('--remote');
    }
  }

  console.log(`[restart] Starting electron-vite ${devArgs.join(' ')} ...`);
  if (isFull && !useWebuiOnly) {
    console.log('[restart] Electron 桌面窗口即将弹出；请保持本终端不关（日志在此输出）。');
    console.log('[restart] 日志中应出现 [1ONE] Dev using prebuilt renderer 与 [1ONE] Showing main window');
    console.log('[restart] 改 UI 请再跑 restart，或 npm run restart:fast 走 Vite HMR');
    console.log('[restart] WebUI 将按设置自动恢复（成员 http://localhost:25809，管理员 http://localhost:25810）');
  } else if (useWebuiOnly) {
    console.log('[restart] 无桌面窗口；浏览器访问 http://localhost:25809（或日志中的端口）');
    const repairScript = path.join(root, 'scripts', 'ensure-mcp-after-dev.mjs');
    if (fs.existsSync(repairScript)) {
      const repair = spawn(process.execPath, [repairScript], {
        detached: true,
        stdio: 'ignore',
        cwd: root,
        env,
      });
      repair.unref();
    }
  }

  startElectronViteDev(root, env, devArgs);
}

void main();
