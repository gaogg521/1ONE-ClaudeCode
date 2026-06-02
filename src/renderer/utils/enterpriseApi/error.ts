/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type EnterpriseRuntimeIssueCode =
  | 'webui_unavailable'
  | 'unsupported_platform'
  | 'not_authenticated'
  | 'not_joined'
  | 'insufficient_role'
  | 'forbidden'
  | 'network'
  | 'unknown';

type ErrorWithMeta = Error & {
  status?: number;
  code?: string;
};

export type EnterpriseRuntimeIssue = {
  code: EnterpriseRuntimeIssueCode;
  message: string;
  status?: number;
};

export function normalizeEnterpriseApiError(
  error: unknown,
  fallbackMessage = 'Request failed'
): EnterpriseRuntimeIssue {
  if (!(error instanceof Error)) {
    return { code: 'unknown', message: fallbackMessage };
  }

  const err = error as ErrorWithMeta;
  const message = err.message?.trim() || fallbackMessage;

  if (message === 'WEBUI_NOT_RUNNING') {
    return {
      code: 'webui_unavailable',
      message: 'WebUI 服务未启动，请先启动企业后台服务。',
      status: err.status,
    };
  }

  if (err.status === 401) {
    return {
      code: 'not_authenticated',
      message: message || '当前会话已失效，请重新登录。',
      status: err.status,
    };
  }

  if (err.status === 403) {
    if (/access denied.*login first/i.test(message)) {
      return {
        code: 'not_authenticated',
        message: '请先登录企业账号后再继续操作。',
        status: err.status,
      };
    }
    return {
      code: 'forbidden',
      message: message || '当前账号无权访问该模块。',
      status: err.status,
    };
  }

  if (
    err.name === 'TypeError' ||
    /failed to fetch/i.test(message) ||
    /network/i.test(message)
  ) {
    return {
      code: 'network',
      message: '无法连接企业后台服务，请检查网络或本地 WebUI 状态。',
      status: err.status,
    };
  }

  return {
    code: 'unknown',
    message,
    status: err.status,
  };
}

export function formatEnterpriseRuntimeIssue(
  issue: EnterpriseRuntimeIssue,
  overrides?: Partial<Record<EnterpriseRuntimeIssueCode, string>>
): string {
  return overrides?.[issue.code] ?? issue.message;
}
