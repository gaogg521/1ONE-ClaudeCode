/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { CODEX_MODE_FULL_AUTO, CODEX_MODE_FULL_AUTO_NO_SANDBOX } from '@/common/types/codex/codexModes';

/** Default permission mode for new sessions — full auto unless user switches manually. */
export const DEFAULT_SESSION_MODE = 'yolo';

const BACKEND_DEFAULT_MODES: Record<string, string> = {
  claude: 'bypassPermissions',
  qwen: 'yolo',
  iflow: 'yolo',
  gemini: 'yolo',
  aionrs: 'yolo',
  codex: CODEX_MODE_FULL_AUTO,
  opencode: 'build',
  cursor: 'agent',
};

/** Resolve effective session mode when none was persisted for this conversation. */
export function resolveSessionMode(
  backend: string | undefined,
  sessionMode: string | undefined,
  options?: { userSet?: boolean }
): string {
  if (sessionMode) {
    const backendDefault = backend ? BACKEND_DEFAULT_MODES[backend] : undefined;
    // Legacy conversations stored 'default' before yolo became the product default.
    if (!options?.userSet && sessionMode === 'default' && backendDefault && backendDefault !== 'default') {
      return backendDefault;
    }
    return sessionMode;
  }
  if (backend && BACKEND_DEFAULT_MODES[backend]) {
    return BACKEND_DEFAULT_MODES[backend];
  }
  return DEFAULT_SESSION_MODE;
}

/** Whether the mode enables auto-approval for tool / permission prompts. */
export function isYoloSessionMode(mode: string): boolean {
  return (
    mode === 'yolo' ||
    mode === 'bypassPermissions' ||
    mode === 'auto' ||
    mode === CODEX_MODE_FULL_AUTO ||
    mode === CODEX_MODE_FULL_AUTO_NO_SANDBOX
  );
}

/** Default mode for UI selectors when backend supports mode switching. */
export function getDefaultSessionMode(backend: string | undefined): string {
  return resolveSessionMode(backend, undefined);
}
