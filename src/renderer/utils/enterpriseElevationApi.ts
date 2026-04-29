/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  EnterpriseElevationPasswordMethod,
  EnterpriseElevationSecondaryOption,
} from '@/common/types/enterpriseElevation';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';

export type EnterpriseElevationState = {
  eligible: boolean;
  elevated: boolean;
  /** Ways the user may unlock enterprise admin (password vs future OAuth). */
  secondaryMethods: EnterpriseElevationSecondaryOption[];
};

export type EnterpriseElevationErrorCode = 'unauthorized' | 'bad_response' | 'network';

export class EnterpriseElevationError extends Error {
  readonly code: EnterpriseElevationErrorCode;

  constructor(code: EnterpriseElevationErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'EnterpriseElevationError';
    this.code = code;
  }
}

export function isEnterpriseElevationError(e: unknown): e is EnterpriseElevationError {
  return e instanceof EnterpriseElevationError;
}

export async function fetchEnterpriseElevation(): Promise<EnterpriseElevationState> {
  let res: Response;
  try {
    res = await fetch('/api/auth/enterprise-elevation', { credentials: 'include' });
  } catch {
    throw new EnterpriseElevationError('network');
  }

  const body = (await res.json().catch((): null => null)) as {
    success?: boolean;
    data?: EnterpriseElevationState & { secondaryMethods?: EnterpriseElevationSecondaryOption[] };
    message?: string;
  };

  if (res.status === 401) {
    throw new EnterpriseElevationError('unauthorized', body?.message);
  }

  if (!res.ok || !body?.success || !body.data) {
    throw new EnterpriseElevationError(
      'bad_response',
      body?.message || 'Failed to load elevation state'
    );
  }

  const secondaryMethods = Array.isArray(body.data.secondaryMethods) ? body.data.secondaryMethods : [];
  return { ...body.data, secondaryMethods };
}

export async function postEnterpriseElevate(
  password: string,
  method?: EnterpriseElevationPasswordMethod
): Promise<void> {
  const res = await fetch('/api/auth/enterprise-elevate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(withCsrfToken({ password, ...(method ? { method } : {}) })),
  });
  const body = (await res.json().catch((): null => null)) as { success?: boolean; message?: string };
  if (!res.ok || !body?.success) {
    throw new Error(body?.message || 'Verification failed');
  }
}

export async function postEnterpriseElevateRevoke(): Promise<void> {
  const res = await fetch('/api/auth/enterprise-elevate/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(withCsrfToken({})),
  });
  const body = (await res.json().catch((): null => null)) as { success?: boolean; message?: string };
  if (!res.ok || !body?.success) {
    throw new Error(body?.message || 'Failed to revoke');
  }
}
