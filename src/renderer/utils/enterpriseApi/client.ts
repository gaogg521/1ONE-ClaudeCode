/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import {
  formatEnterpriseRuntimeIssue,
  normalizeEnterpriseApiError,
  type EnterpriseRuntimeIssueCode,
} from './error';

export async function enterpriseGet<T>(path: string): Promise<T> {
  return fetchWebuiApiJson<T>(path);
}

export async function enterpriseMutate<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  payload: Record<string, unknown>
): Promise<T> {
  return fetchWebuiApiJson<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken(payload)),
  });
}

export function getEnterpriseActionError(
  error: unknown,
  fallback: string,
  overrides?: Partial<Record<EnterpriseRuntimeIssueCode, string>>
): string {
  return formatEnterpriseRuntimeIssue(normalizeEnterpriseApiError(error, fallback), overrides);
}
