/**
 * NPX ACP bridge backends that can be pre-downloaded (renderer + main safe).
 */

export const PREFETCHABLE_NPX_BACKENDS = ['claude', 'codex', 'codebuddy'] as const;
export type PrefetchableNpxBackend = (typeof PREFETCHABLE_NPX_BACKENDS)[number];

export function isPrefetchableNpxBackend(b: string): b is PrefetchableNpxBackend {
  return (PREFETCHABLE_NPX_BACKENDS as readonly string[]).includes(b);
}
