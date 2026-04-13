/**
 * Shared types for the Agent environment probe (main + renderer).
 */

/** How 1ONE can use this tool as an ACP agent. */
export type AgentInstallUsableInOne = 'yes' | 'npx_bridge' | 'no';

export type AgentInstallProbeRow = {
  /** ACP backend id or `_node` / `_npx` for runtime. */
  id: string;
  name: string;
  cliCommand: string;
  cliOnPath: boolean;
  usableInOne: AgentInstallUsableInOne;
  /** Suffix keys for t(`settings.agentInstallProbe.${key}`), e.g. hintCursorUserData. */
  environmentHintKeys: string[];
};

export type AgentInstallProbeResult = {
  rows: AgentInstallProbeRow[];
  /** ISO timestamp for display / debugging */
  generatedAt: string;
};
