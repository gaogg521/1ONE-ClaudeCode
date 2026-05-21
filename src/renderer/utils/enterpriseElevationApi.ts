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
import { fetchWebuiApi } from '@/renderer/utils/webuiApiBase';

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

async function enterpriseAuthFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetchWebuiApi(path, init);
  } catch (e) {
    if (e instanceof Error && e.message === 'WEBUI_NOT_RUNNING') {
      throw new EnterpriseElevationError('network', 'WebUI is not running');
    }
    throw new EnterpriseElevationError('network');
  }
}

export async function fetchEnterpriseElevation(): Promise<EnterpriseElevationState> {
  let res: Response;
  try {
    res = await enterpriseAuthFetch('/api/auth/enterprise-elevation');
  } catch (e) {
    if (e instanceof EnterpriseElevationError) throw e;
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

export type EnterpriseElevateErrorCode =
  | 'incorrect_password'
  | 'csrf'
  | 'not_eligible'
  | 'rate_limited'
  | 'gateway_timeout'
  | 'server_error'
  | 'network'
  | 'unknown';

export class EnterpriseElevateError extends Error {
  readonly code: EnterpriseElevateErrorCode;

  constructor(code: EnterpriseElevateErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'EnterpriseElevateError';
    this.code = code;
  }
}

export function isEnterpriseElevateError(e: unknown): e is EnterpriseElevateError {
  return e instanceof EnterpriseElevateError;
}

function readElevateFailText(body: { message?: unknown; error?: unknown } | null | undefined): string {
  const m = typeof body?.message === 'string' ? body.message.trim() : '';
  const er = typeof body?.error === 'string' ? body.error.trim() : '';
  return m || er || '';
}

export async function postEnterpriseElevate(
  password: string,
  method?: EnterpriseElevationPasswordMethod
): Promise<void> {
  let res: Response;
  try {
    res = await enterpriseAuthFetch('/api/auth/enterprise-elevate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withCsrfToken({ password, ...(method ? { method } : {}) })),
    });
  } catch (e) {
    if (e instanceof EnterpriseElevationError) {
      throw new EnterpriseElevateError('network', e.message);
    }
    throw new EnterpriseElevateError('network');
  }

  const body = (await res.json().catch((): null => null)) as {
    success?: boolean;
    message?: string;
    error?: string;
    code?: string;
  };

  if (res.ok && body?.success) {
    return;
  }

  const failText = readElevateFailText(body);

  if (res.status === 429) {
    throw new EnterpriseElevateError(
      'rate_limited',
      failText || 'Too many sensitive actions, please try again later.'
    );
  }

  if (res.status === 408 || res.status === 502 || res.status === 503 || res.status === 504) {
    throw new EnterpriseElevateError(
      'gateway_timeout',
      failText || `HTTP ${res.status}`
    );
  }

  if (res.status === 500) {
    throw new EnterpriseElevateError(
      'server_error',
      failText || 'Internal server error'
    );
  }

  if (res.status === 401) {
    throw new EnterpriseElevateError('incorrect_password', failText || 'Incorrect password');
  }
  if (res.status === 403) {
    const msg = failText.toLowerCase();
    if (msg.includes('not eligible')) {
      throw new EnterpriseElevateError('not_eligible', failText);
    }
    throw new EnterpriseElevateError('csrf', failText || 'CSRF validation failed');
  }

  if (/incorrect\s+password|invalid\s+(username\s+)?or\s+password/i.test(failText)) {
    throw new EnterpriseElevateError('incorrect_password', failText);
  }

  throw new EnterpriseElevateError('unknown', failText);
}

export async function postEnterpriseElevateRevoke(): Promise<void> {
  const res = await enterpriseAuthFetch('/api/auth/enterprise-elevate/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken({})),
  });
  const body = (await res.json().catch((): null => null)) as { success?: boolean; message?: string };
  if (!res.ok || !body?.success) {
    throw new Error(body?.message || 'Failed to revoke');
  }
}
