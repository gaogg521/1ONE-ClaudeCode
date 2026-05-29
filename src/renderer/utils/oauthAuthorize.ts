/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { fetchWebuiApi, getWebuiApiBaseUrl } from '@/renderer/utils/webuiApiBase';

export type OAuthAuthorizeResult = { ok: true } | { ok: false; message: string; code?: string };

type OAuthErrorBody = {
  success?: boolean;
  message?: string;
  code?: string;
};

function readOAuthErrorMessage(body: OAuthErrorBody | null, status: number): string {
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (message) {
    return message;
  }
  if (status === 404) {
    return 'OAuth provider is not available';
  }
  return 'OAuth authorization failed';
}

async function requestOAuthAuthorize(path: string): Promise<Response> {
  if (isElectronDesktop()) {
    return fetchWebuiApi(path, { method: 'GET', redirect: 'manual' });
  }
  return fetch(path, { method: 'GET', credentials: 'include', redirect: 'manual' });
}

/**
 * Start an OAuth authorize flow. Always attempts server-side authorization first;
 * surfaces backend errors instead of pre-checking provider flags in the UI.
 */
export async function startOAuthAuthorize(path: string): Promise<OAuthAuthorizeResult> {
  if (isElectronDesktop()) {
    const base = await getWebuiApiBaseUrl();
    if (!base) {
      return { ok: false, message: 'WEBUI_NOT_RUNNING', code: 'webui_not_running' };
    }
  }

  try {
    const response = await requestOAuthAuthorize(path);
    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? ((await response.json().catch((): null => null)) as (OAuthErrorBody & {
          data?: { goto?: string };
        }) | null)
      : null;

    const gotoUrl = typeof body?.data?.goto === 'string' ? body.data.goto.trim() : '';
    if (response.ok && body?.success && gotoUrl) {
      if (isElectronDesktop()) {
        await openExternalUrl(gotoUrl);
      } else {
        window.location.href = gotoUrl;
      }
      return { ok: true };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (location) {
        if (isElectronDesktop()) {
          await openExternalUrl(location);
        } else {
          window.location.href = location;
        }
        return { ok: true };
      }
    }

    if (!response.ok || body?.success === false) {
      const code =
        typeof body?.code === 'string'
          ? body.code
          : isElectronDesktop() && response.status >= 300 && response.status < 400
            ? 'missing_redirect_url'
            : undefined;
      return {
        ok: false,
        message: readOAuthErrorMessage(body, response.status),
        code,
      };
    }

    if (isElectronDesktop()) {
      return {
        ok: false,
        message: 'OAuth authorization failed',
        code: 'missing_redirect_url',
      };
    }

    window.location.href = path;
    return { ok: true };
  } catch (error) {
    console.error('OAuth authorize request failed:', error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'OAuth authorization failed',
    };
  }
}

export function formatOAuthAuthorizeError(
  message: string,
  t: (key: string, options?: { defaultValue?: string }) => string,
  code?: string
): string {
  if (message === 'WEBUI_NOT_RUNNING' || message === 'webui_not_running' || code === 'webui_not_running') {
    return t('settings.webui.joinNeedWebuiRunning', { defaultValue: '请先启用 WebUI 服务' });
  }
  if (code === 'NOT_CONFIGURED' || message.endsWith('login is not configured')) {
    if (message.startsWith('DingTalk')) {
      return t('login.errors.dingtalkNotConfigured', {
        defaultValue:
          '钉钉 SSO 尚未在「管理后台 → 认证与邮件 → 钉钉」中配置。注意：设置里的钉钉频道机器人不是组织登录。',
      });
    }
    if (message.startsWith('WeCom')) {
      return t('login.errors.wecomNotConfigured', {
        defaultValue:
          '企业微信 SSO 尚未在「管理后台 → 认证与邮件 → 企业微信」中配置。',
      });
    }
    return t('login.errors.feishuNotConfigured', {
      defaultValue:
        '飞书 SSO 尚未在「管理后台 → 认证与邮件 → 飞书」中配置。注意：设置里的飞书频道机器人不是组织登录。',
    });
  }
  if (
    code === 'NOT_ENABLED' ||
    message.endsWith('login is configured but not enabled') ||
    message.endsWith('login is not enabled')
  ) {
    if (message.startsWith('DingTalk')) {
      return t('login.errors.dingtalkConfiguredButDisabled', {
        defaultValue:
          '钉钉已在管理后台配置，但「启用」开关未打开。请前往 管理后台 → 认证与邮件 → 钉钉，打开启用并保存。',
      });
    }
    if (message.startsWith('WeCom')) {
      return t('login.errors.wecomConfiguredButDisabled', {
        defaultValue:
          '企业微信已在管理后台配置，但「启用」开关未打开。请前往 管理后台 → 认证与邮件 → 企业微信，打开启用并保存。',
      });
    }
    return t('login.errors.feishuConfiguredButDisabled', {
      defaultValue:
        '飞书已在管理后台配置，但「启用」开关未打开，或与 LDAP/其他 SSO 冲突。请前往 管理后台 → 认证与邮件 → 飞书，打开启用并保存。',
    });
  }
  if (message === 'Feishu provider not configured') {
    return t('login.errors.feishuNotConfigured', {
      defaultValue: '飞书登录尚未配置完成，请联系组织管理员。',
    });
  }
  if (message === 'OAuth provider is not available') {
    return t('login.errors.oauthNotAvailable', {
      defaultValue: '该登录方式暂不可用，请联系管理员或改用其他方式。',
    });
  }
  return message;
}
