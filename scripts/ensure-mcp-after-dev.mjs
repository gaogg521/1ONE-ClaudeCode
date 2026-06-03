/**
 * electron-vite dev rebuilds out/main and overwrites fat MCP bundles with thin stubs.
 * Poll until dev main build finishes, then restore self-contained MCP scripts.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_TOOLS = path.join(ROOT, 'out', 'main', 'builtin-mcp-web-tools.js');
const MIN_BYTES = 80_000;
const MAX_WAIT_MS = 120_000;
const POLL_MS = 2_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function needsRepair() {
  try {
    return fs.statSync(WEB_TOOLS).size < MIN_BYTES;
  } catch {
    return true;
  }
}

async function main() {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    if (fs.existsSync(path.join(ROOT, 'out', 'main', 'index.js')) && !needsRepair()) {
      return;
    }
    await sleep(POLL_MS);
  }

  if (!needsRepair()) {
    return;
  }

  console.log('[restart] Restoring self-contained MCP bundles after dev main build...');
  execSync(`node "${path.join(ROOT, 'scripts', 'build-mcp-servers.js')}"`, {
    stdio: 'inherit',
    cwd: ROOT,
  });
}

void main().catch((error) => {
  console.warn('[restart] MCP post-dev repair failed:', error);
  process.exitCode = 1;
});
