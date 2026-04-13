/**
 * Build install guidance for ACP backends that are enabled but not detected.
 */

import { POTENTIAL_ACP_CLIS, type AcpBackendAll } from '@/common/types/acpTypes';

export type { PrefetchableNpxBackend } from '@/common/config/agentPrefetchBackends';
export { PREFETCHABLE_NPX_BACKENDS, isPrefetchableNpxBackend } from '@/common/config/agentPrefetchBackends';

const NPX_BRIDGE_BACKENDS = new Set<AcpBackendAll>(['claude', 'codex', 'codebuddy']);

export type AgentSetupHint = {
  backend: AcpBackendAll;
  name: string;
  cliCommand: string;
};

export function buildAgentSetupHints(params: {
  detectedBackends: Set<string>;
  npxAvailable: boolean;
}): AgentSetupHint[] {
  const { detectedBackends, npxAvailable } = params;
  const hints: AgentSetupHint[] = [];
  for (const cli of POTENTIAL_ACP_CLIS) {
    if (detectedBackends.has(cli.backendId)) continue;
    if (NPX_BRIDGE_BACKENDS.has(cli.backendId) && npxAvailable) continue;
    hints.push({
      backend: cli.backendId,
      name: cli.name,
      cliCommand: cli.cmd,
    });
  }
  return hints;
}
