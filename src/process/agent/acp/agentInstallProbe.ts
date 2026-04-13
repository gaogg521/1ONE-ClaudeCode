/**
 * Heuristic probe of mainstream AI CLI / runtime install signals for the settings UI.
 * Combines PATH checks (via AcpDetector) with common data dirs and config paths.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import { POTENTIAL_ACP_CLIS } from '@/common/types/acpTypes';
import type { AgentInstallProbeResult, AgentInstallProbeRow } from '@/common/types/agentInstallProbe';

const NPX_BRIDGE_BACKENDS = new Set<AcpBackendAll>(['claude', 'codex', 'codebuddy']);

type DetectorApi = {
  isCommandOnPath: (command: string) => boolean;
  getDetectedAgents: () => Array<{ backend: string }>;
};

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Map backend → i18n keys under settings.agentInstallProbe (e.g. hintCursorUserData).
 * Heuristic only — no process scanning.
 */
function collectEnvironmentHintKeysByBackend(): Partial<Record<AcpBackendAll, string[]>> {
  const home = os.homedir();
  const sets: Partial<Record<AcpBackendAll, Set<string>>> = {};
  const add = (b: AcpBackendAll, hintKey: string) => {
    if (!sets[b]) sets[b] = new Set();
    sets[b]!.add(hintKey);
  };

  if (process.platform === 'win32') {
    if (process.env.APPDATA && safeExists(path.join(process.env.APPDATA, 'Cursor'))) {
      add('cursor', 'hintCursorUserData');
    }
    if (process.env.LOCALAPPDATA) {
      const la = process.env.LOCALAPPDATA;
      if (safeExists(path.join(la, 'AnthropicClaude')) || safeExists(path.join(la, 'Anthropic', 'Claude'))) {
        add('claude', 'hintClaudeDesktopData');
      }
    }
  } else if (process.platform === 'darwin') {
    if (safeExists(path.join(home, 'Library', 'Application Support', 'Cursor'))) {
      add('cursor', 'hintCursorUserData');
    }
    if (safeExists('/Applications/Claude.app') || safeExists(path.join(home, 'Library', 'Application Support', 'Claude'))) {
      add('claude', 'hintClaudeDesktopData');
    }
  } else {
    if (safeExists(path.join(home, '.cursor'))) {
      add('cursor', 'hintCursorUserData');
    }
  }

  if (safeExists(path.join(home, '.cursor'))) {
    add('cursor', 'hintCursorDotDir');
  }

  if (safeExists(path.join(home, '.codex'))) {
    add('codex', 'hintCodexDotDir');
  }
  if (safeExists(path.join(home, '.codebuddy'))) {
    add('codebuddy', 'hintCodebuddyDotDir');
  }

  const claudeSettings = path.join(home, '.claude', 'settings.json');
  if (safeExists(claudeSettings)) {
    add('claude', 'hintClaudeSettingsJson');
  }

  const out: Partial<Record<AcpBackendAll, string[]>> = {};
  for (const b of Object.keys(sets) as AcpBackendAll[]) {
    out[b] = [...sets[b]!];
  }
  return out;
}

function resolveUsableInOne(params: {
  backend: AcpBackendAll;
  cliOnPath: boolean;
  npxOnPath: boolean;
}): AgentInstallProbeRow['usableInOne'] {
  const { backend, cliOnPath, npxOnPath } = params;
  if (cliOnPath) return 'yes';
  if (NPX_BRIDGE_BACKENDS.has(backend) && npxOnPath) return 'npx_bridge';
  return 'no';
}

export function buildAgentInstallProbe(detector: DetectorApi): AgentInstallProbeResult {
  const npxOnPath = detector.isCommandOnPath('npx');
  const nodeOnPath = detector.isCommandOnPath('node');
  const hintByBackend = collectEnvironmentHintKeysByBackend();

  const hintKeysFor = (backend: AcpBackendAll): string[] => hintByBackend[backend] ?? [];

  const rows: AgentInstallProbeRow[] = [
    {
      id: '_node',
      name: 'Node.js',
      cliCommand: 'node',
      cliOnPath: nodeOnPath,
      usableInOne: nodeOnPath ? 'yes' : 'no',
      environmentHintKeys: [],
    },
    {
      id: '_npx',
      name: 'npx',
      cliCommand: 'npx',
      cliOnPath: npxOnPath,
      usableInOne: npxOnPath ? 'yes' : 'no',
      environmentHintKeys: [],
    },
  ];

  const clis = [...POTENTIAL_ACP_CLIS];
  for (const cli of clis) {
    const backend = cli.backendId;
    const cliOnPath = detector.isCommandOnPath(cli.cmd);
    rows.push({
      id: backend,
      name: cli.name,
      cliCommand: cli.cmd,
      cliOnPath,
      usableInOne: resolveUsableInOne({ backend, cliOnPath, npxOnPath }),
      environmentHintKeys: hintKeysFor(backend),
    });
  }

  return { rows, generatedAt: new Date().toISOString() };
}
