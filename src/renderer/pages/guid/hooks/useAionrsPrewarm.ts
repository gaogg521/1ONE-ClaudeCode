/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TProviderWithModel } from '@/common/config/storage';
import { useEffect } from 'react';

/**
 * Build the pool key for an aionrs prewarm slot.
 * Same logic used on both renderer (trigger side) and main (dedup side):
 * `${provider id}::${useModel}::${workspace}`.
 *
 * Workspace defaults to '' (the binary's "current dir" semantics) so that the
 * Guid-page-default-workspace case still produces a stable key.
 */
export function buildPrewarmKey(model: TProviderWithModel, workspace: string | undefined): string {
  return `${model.id}::${model.useModel}::${workspace || ''}`;
}

type UseAionrsPrewarmParams = {
  selectedAgent: string;
  currentModel: TProviderWithModel | undefined;
  workspace: string;
  selectedMode: string;
  /** Disable prewarm while loading/sending — avoids racing the actual send. */
  loading: boolean;
};

/**
 * Trigger aionrs worker prewarm when the user has chosen an aionrs agent + model +
 * workspace in the Guid page and paused. Debounced 200ms so rapid model/workspace
 * flicks do not thrash the pool.
 *
 * The hook is best-effort and side-effect-only — failures are silently swallowed.
 * It pairs with `useGuidSend`'s aionrs branch, which claims the prewarmed worker
 * via `ipcBridge.conversation.prewarmClaim` at send time.
 */
export function useAionrsPrewarm({
  selectedAgent,
  currentModel,
  workspace,
  selectedMode,
  loading,
}: UseAionrsPrewarmParams): void {
  useEffect(() => {
    if (loading) return;
    if (selectedAgent !== 'aionrs') return;
    if (!currentModel?.id || !currentModel?.useModel) return;

    const key = buildPrewarmKey(currentModel, workspace);
    const handle = setTimeout(() => {
      const t0 = performance.now();
      console.log(`[aionrs:prewarm] trigger key=${key}`);
      void ipcBridge.conversation.prewarmCreate
        .invoke({
          key,
          type: 'aionrs',
          model: currentModel,
          workspace: workspace || undefined,
          customWorkspace: !!workspace,
          sessionMode: selectedMode,
        })
        .then((res) => {
          console.log(
            `[aionrs:prewarm] spawn done +${Math.round(performance.now() - t0)}ms`,
            res ? `conv=${res.conversation_id}` : 'null',
          );
        })
        .catch(() => {
          console.warn(`[aionrs:prewarm] spawn failed +${Math.round(performance.now() - t0)}ms`);
        });
    }, 200);

    return () => clearTimeout(handle);
  }, [selectedAgent, currentModel, workspace, selectedMode, loading]);
}
