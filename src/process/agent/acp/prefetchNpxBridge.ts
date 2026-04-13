/**
 * Best-effort npx fetch of ACP bridge packages (warms npm cache, speeds first chat).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  CLAUDE_ACP_NPX_PACKAGE,
  CODEBUDDY_ACP_NPX_PACKAGE,
  CODEX_ACP_NPX_PACKAGE,
} from '@/common/types/acpTypes';
import { prepareCleanEnv } from '@process/agent/acp/acpConnectors';
import { resolveNpxPath, getWindowsShellExecutionOptions } from '@process/utils/shellEnv';
import type { PrefetchableNpxBackend } from '@/common/config/agentPrefetchBackends';

const execFileAsync = promisify(execFile);

const PACKAGE_BY_BACKEND: Record<PrefetchableNpxBackend, string> = {
  claude: CLAUDE_ACP_NPX_PACKAGE,
  codex: CODEX_ACP_NPX_PACKAGE,
  codebuddy: CODEBUDDY_ACP_NPX_PACKAGE,
};

export async function prefetchNpxBridge(backend: PrefetchableNpxBackend): Promise<{ success: boolean; msg?: string }> {
  const pkg = PACKAGE_BY_BACKEND[backend];
  try {
    const cleanEnv = await prepareCleanEnv();
    const npxPath = resolveNpxPath(cleanEnv);
    await execFileAsync(npxPath, ['-y', pkg, '--version'], {
      timeout: 180_000,
      env: cleanEnv as NodeJS.ProcessEnv,
      ...getWindowsShellExecutionOptions(),
      windowsHide: true,
    });
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, msg };
  }
}
