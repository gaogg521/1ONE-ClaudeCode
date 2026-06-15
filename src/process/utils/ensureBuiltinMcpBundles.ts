/**
 * Ensure built-in MCP entry scripts are self-contained CJS bundles (esbuild via build-mcp-servers.js).
 * electron-vite dev emits thin externals-only stubs that break when `node` runs them outside the main bundle.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getPlatformServices } from '@/common/platform';
import { getBuiltinMcpScriptPath } from '@process/utils/initStorage';

/** Bundled MCP scripts are ~1MB+; vite dev stubs are a few KB. */
const MIN_SELF_CONTAINED_BYTES = 80_000;

let ensurePromise: Promise<void> | null = null;

function scriptNeedsRebuild(scriptName: string): boolean {
  const scriptPath = getBuiltinMcpScriptPath(scriptName);
  try {
    const stat = fs.statSync(scriptPath);
    return stat.size < MIN_SELF_CONTAINED_BYTES;
  } catch {
    return true;
  }
}

export function ensureBuiltinMcpBundles(): Promise<void> {
  if (ensurePromise) {
    return ensurePromise;
  }

  ensurePromise = (async () => {
    if (getPlatformServices().paths.isPackaged()) {
      return;
    }

    const needsImageGen = scriptNeedsRebuild('builtin-mcp-image-gen');
    const needsWebTools = scriptNeedsRebuild('builtin-mcp-web-tools');
    if (!needsImageGen && !needsWebTools) {
      return;
    }

    const mainDir = path.dirname(getBuiltinMcpScriptPath('builtin-mcp-web-tools'));
    const root = path.resolve(mainDir, '../..');
    const buildScript = path.join(root, 'scripts', 'build-mcp-servers.js');
    console.log('[MCP] Rebuilding self-contained builtin MCP bundles (required for stdio subprocesses)...');
    execSync(`node "${buildScript}"`, { stdio: 'inherit', cwd: root });
  })().catch((error) => {
    ensurePromise = null;
    console.warn('[MCP] Failed to ensure builtin MCP bundles:', error instanceof Error ? error.message : String(error));
  });

  return ensurePromise;
}
