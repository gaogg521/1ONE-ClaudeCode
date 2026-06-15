/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getModelContextLimit } from '@/common/utils/modelContextLimits';

/**
 * Whether a model id/alias indicates the 1M token context window.
 */
export function isOneMillionContextModel(modelName: string | undefined | null): boolean {
  if (!modelName) return false;
  const lower = modelName.toLowerCase();
  return (
    lower.includes('[1m]') ||
    lower.includes('-1m') ||
    lower.endsWith('1m') ||
    lower.includes('1m-context') ||
    lower.includes('1000000') ||
    lower.includes('1_000_000')
  );
}

/**
 * Resolve the context window size shown in the UI for ACP sessions.
 * Claude Code may report usage_update.size=200000 while the active model supports 1M;
 * prefer the larger of reported size and model-based lookup.
 */
export function resolveAcpContextLimit(reportedSize: number, modelId?: string | null): number {
  const modelLimit = modelId ? getModelContextLimit(modelId) : 0;
  const normalizedReported = reportedSize > 0 ? reportedSize : 0;

  if (normalizedReported > 0 && modelLimit > 0) {
    return Math.max(normalizedReported, modelLimit);
  }
  if (normalizedReported > 0) {
    return normalizedReported;
  }
  if (modelLimit > 0) {
    return modelLimit;
  }
  return 0;
}
