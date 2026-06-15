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
const IMAGE_GEN = path.join(ROOT, 'out', 'main', 'builtin-mcp-image-gen.js');
const MAIN_INDEX = path.join(ROOT, 'out', 'main', 'index.js');
const MIN_BYTES = 80_000;
const MAX_WAIT_MS = 120_000;
const POLL_MS = 2_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function needsRepair() {
  try {
    const webToolsOk = fs.statSync(WEB_TOOLS).size >= MIN_BYTES;
    const imageGenOk = fs.statSync(IMAGE_GEN).size >= MIN_BYTES;
    return !(webToolsOk && imageGenOk);
  } catch {
    return true;
  }
}

async function waitForDevMainBuild() {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    if (fs.existsSync(MAIN_INDEX)) {
      return true;
    }
    await sleep(POLL_MS);
  }
  return fs.existsSync(MAIN_INDEX);
}

async function main() {
  const ready = await waitForDevMainBuild();
  if (!ready) {
    console.warn('[restart] MCP post-dev repair: timed out waiting for out/main/index.js');
    return;
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
