/**
 * Dev cache cleanup (repo + optional Electron profile caches).
 * Does NOT delete user data (SQLite, one-config, conversations) unless --data is passed.
 *
 * Usage:
 *   node scripts/clean-dev-caches.mjs              # show sizes + help
 *   node scripts/clean-dev-caches.mjs --build      # out/, renderer build hash
 *   node scripts/clean-dev-caches.mjs --vite       # node_modules/.vite
 *   node scripts/clean-dev-caches.mjs --codegraph  # .codegraph index
 *   node scripts/clean-dev-caches.mjs --electron   # Chromium caches under %APPDATA%\1OneClaudeCode-Dev
 *   node scripts/clean-dev-caches.mjs --all-safe   # build + vite + codegraph + electron caches
 *
 * @license Apache-2.0
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const REPO_TARGETS = {
  build: [
    path.join(ROOT, 'out'),
    path.join(ROOT, 'out', '.build-hash'),
  ],
  vite: [path.join(ROOT, 'node_modules', '.vite')],
  codegraph: [path.join(ROOT, '.codegraph')],
};

function getAppDataRoot() {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, '1OneClaudeCode-Dev');
}

const ELECTRON_CACHE_DIRS = ['Cache', 'Code Cache', 'GPUCache', 'logs', 'DIPS', 'DIPS-wal'];

function dirSizeMb(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return 0;
  }
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return stat.size / (1024 * 1024);
  }
  let total = 0;
  const stack = [targetPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          total += fs.statSync(full).size;
        }
      } catch {
        // ignore locked files
      }
    }
  }
  return total / (1024 * 1024);
}

function rmSafe(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return { path: targetPath, status: 'missing' };
  }
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return { path: targetPath, status: 'removed' };
  } catch (error) {
    return { path: targetPath, status: 'failed', error: String(error) };
  }
}

function printSizes() {
  console.log('--- Repo ---');
  for (const [key, paths] of Object.entries(REPO_TARGETS)) {
    const mb = paths.reduce((sum, p) => sum + dirSizeMb(p), 0);
    console.log(`  ${key}: ~${mb.toFixed(1)} MB  (${paths.join(', ')})`);
  }
  const appRoot = getAppDataRoot();
  console.log(`\n--- App profile (${appRoot}) ---`);
  if (!fs.existsSync(appRoot)) {
    console.log('  (not found)');
    return;
  }
  for (const name of ['config', '1one', ...ELECTRON_CACHE_DIRS]) {
    const full = path.join(appRoot, name);
    console.log(`  ${name}: ~${dirSizeMb(full).toFixed(1)} MB`);
  }
  console.log('\nKeep: config/ (settings), 1one/ (SQLite DB).');
  console.log('Safe to clear with --electron: Cache, Code Cache, GPUCache, logs.');
}

function run(flags) {
  const results = [];
  if (flags.build) {
    for (const p of REPO_TARGETS.build) {
      results.push(rmSafe(p));
    }
  }
  if (flags.vite) {
    for (const p of REPO_TARGETS.vite) {
      results.push(rmSafe(p));
    }
  }
  if (flags.codegraph) {
    for (const p of REPO_TARGETS.codegraph) {
      results.push(rmSafe(p));
    }
  }
  if (flags.electron) {
    const appRoot = getAppDataRoot();
    for (const name of ELECTRON_CACHE_DIRS) {
      results.push(rmSafe(path.join(appRoot, name)));
    }
    const lockfile = path.join(appRoot, 'lockfile');
    results.push(rmSafe(lockfile));
  }
  for (const r of results) {
    console.log(`[${r.status}] ${r.path}${r.error ? ` — ${r.error}` : ''}`);
  }
}

const args = new Set(process.argv.slice(2));
const flags = {
  build: args.has('--build'),
  vite: args.has('--vite'),
  codegraph: args.has('--codegraph'),
  electron: args.has('--electron'),
};

if (args.has('--all-safe')) {
  flags.build = true;
  flags.vite = true;
  flags.codegraph = true;
  flags.electron = true;
}

const hasAction = Object.values(flags).some(Boolean);
if (!hasAction) {
  printSizes();
  console.log(`
Usage:
  node scripts/clean-dev-caches.mjs --build       # remove out/ (fixes stale UI; rebuild required)
  node scripts/clean-dev-caches.mjs --vite        # Vite prebundle cache
  node scripts/clean-dev-caches.mjs --codegraph   # CodeGraph index (re-index after)
  node scripts/clean-dev-caches.mjs --electron    # quit app first; Chromium + lockfile
  node scripts/clean-dev-caches.mjs --all-safe    # all of the above

After --build: npm run restart (full rebuild is included by default)
`);
  process.exit(0);
}

if (flags.electron) {
  console.warn('Close 1ONE ClaudeCode before --electron cleanup.');
}

printSizes();
console.log('\nCleaning...');
run(flags);
console.log('\nDone.');
