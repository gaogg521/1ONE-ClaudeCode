/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TFunction } from 'i18next';
import { isEnterpriseElevateError } from '@/renderer/utils/enterpriseElevationApi';
import type {
  EnterpriseElevationLdapUnavailableReason,
  EnterpriseElevationPasswordMethod,
  EnterpriseElevationSecondaryOption,
} from '@/common/types/enterpriseElevation';

export const VERIFY_CHOICE_STORAGE_KEY = '1one-enterprise-elevate-verify-choice';

export type FlatVerifyOption =
  | {
      id: string;
      kind: 'password';
      method: EnterpriseElevationPasswordMethod;
      /** LDAP row shown but POST is blocked until admin binds LDAP identity */
      locked?: boolean;
      lockedReason?: EnterpriseElevationLdapUnavailableReason;
    }
  | {
      id: string;
      kind: 'oauth';
      providerId: EnterpriseElevationSecondaryOption['id'];
      available: boolean;
    };

export function buildFlatVerifyOptions(methods: EnterpriseElevationSecondaryOption[]): FlatVerifyOption[] {
  const localRow = methods.find((m) => m.id === 'local_password');
  const ldapRow = methods.find((m) => m.id === 'ldap');
  const hasLocal = Boolean(localRow?.available);
  const hasLdap = Boolean(ldapRow?.available);
  const ldapLocked =
    ldapRow?.kind === 'password' && !ldapRow.available && ldapRow.unavailableReason !== undefined;
  const out: FlatVerifyOption[] = [];

  if (hasLocal && hasLdap) {
    out.push({ id: 'pw-auto', kind: 'password', method: 'auto' });
  }
  if (hasLocal) {
    out.push({ id: 'pw-local', kind: 'password', method: 'local_password' });
  }
  if (hasLdap) {
    out.push({ id: 'pw-ldap', kind: 'password', method: 'ldap' });
  } else if (ldapLocked && ldapRow.unavailableReason) {
    out.push({
      id: 'pw-ldap-locked',
      kind: 'password',
      method: 'ldap',
      locked: true,
      lockedReason: ldapRow.unavailableReason,
    });
  }
  for (const m of methods.filter((x) => x.kind === 'oauth')) {
    out.push({
      id: `oauth-${m.id}`,
      kind: 'oauth',
      providerId: m.id,
      available: m.available,
    });
  }
  return out;
}

export function pickDefaultVerifyChoiceId(flat: FlatVerifyOption[], saved: string | null): string {
  if (flat.length === 0) return '';
  const passwordOpts = flat.filter(
    (o): o is Extract<FlatVerifyOption, { kind: 'password' }> =>
      o.kind === 'password' && !o.locked
  );
  if (saved && flat.some((o) => o.id === saved)) {
    const sel = flat.find((o) => o.id === saved)!;
    if (sel.kind === 'oauth' && !sel.available && passwordOpts.length > 0) {
      return passwordOpts[0].id;
    }
    if (sel.kind === 'password' && sel.locked && passwordOpts.length > 0) {
      return passwordOpts[0].id;
    }
    return saved;
  }
  if (passwordOpts.length > 0) return passwordOpts[0].id;
  const nonLocked = flat.find((o) => !(o.kind === 'password' && o.locked));
  return nonLocked?.id ?? flat[0]?.id ?? '';
}

export function labelForVerifyOption(opt: FlatVerifyOption, t: TFunction): string {
  if (opt.kind === 'password') {
    if (opt.method === 'auto') {
      return t('settings.enterpriseAdmin.elevateOptionAuto', {
        defaultValue: '自动（先试本地密码，再试域账号）',
      });
    }
    if (opt.method === 'local_password') {
      return t('settings.enterpriseAdmin.elevateMethodLocal', { defaultValue: '本地密码' });
    }
    if (opt.locked && opt.lockedReason === 'ldap_not_bound') {
      return t('settings.enterpriseAdmin.elevateMethodLdapNotBound', {
        defaultValue: '域账号 (LDAP · 尚未绑定)',
      });
    }
    if (opt.locked && opt.lockedReason === 'ldap_not_configured') {
      return t('settings.enterpriseAdmin.elevateMethodLdapNotConfigured', {
        defaultValue: '域账号 (LDAP · 未启用或未配置)',
      });
    }
    return t('settings.enterpriseAdmin.elevateMethodLdap', { defaultValue: '域账号 (LDAP)' });
  }
  const name =
    opt.providerId === 'feishu'
      ? t('settings.enterpriseAdmin.methodFeishu', { defaultValue: '飞书' })
      : opt.providerId === 'dingtalk'
        ? t('settings.enterpriseAdmin.methodDingTalk', { defaultValue: '钉钉' })
        : opt.providerId === 'wecom'
          ? t('settings.enterpriseAdmin.methodWeCom', { defaultValue: '企业微信' })
          : opt.providerId;
  if (!opt.available) {
    return `${name} (${t('settings.enterpriseAdmin.oauthComingSoon', { defaultValue: '即将上线' })})`;
  }
  return name;
}

export function formatEnterpriseElevateError(e: unknown, t: TFunction): string {
  if (isEnterpriseElevateError(e)) {
    if (e.code === 'incorrect_password') {
      return t('settings.enterpriseAdmin.elevateIncorrectPassword', {
        defaultValue: '密码错误。请输入当前 WebUI 登录账号的密码；若您使用域账号登录，请选择「域账号 (LDAP)」验证方式。',
      });
    }
    if (e.code === 'csrf') {
      return t('settings.enterpriseAdmin.elevateCsrf', {
        defaultValue: '安全校验失败，请刷新页面后重新登录再试。',
      });
    }
    if (e.code === 'not_eligible') {
      return t('settings.enterpriseAdmin.elevateNotEligible', {
        defaultValue: '当前账号无权进行企业管理二次验证。',
      });
    }
    if (e.code === 'network') {
      return t('settings.enterpriseAdmin.elevationNetworkError', {
        defaultValue: '无法连接服务器，请检查网络后重试。',
      });
    }
    if (e.code === 'rate_limited') {
      return t('settings.enterpriseAdmin.elevateRateLimited', {
        defaultValue:
          '短时间内验证请求次数过多已被限流。请等待约一分钟后再试，或避免连续双击「确定」。',
      });
    }
    if (e.code === 'gateway_timeout') {
      return t('settings.enterpriseAdmin.elevateGatewayTimeout', {
        defaultValue:
          '网关或代理超时（常见为 HTTP 504/502）。若经 Nginx/Tailscale 访问，请增大上游超时或直接访问 WebUI 端口；也与服务端过载有关，请稍后重试。',
      });
    }
    if (e.code === 'server_error') {
      return t('settings.enterpriseAdmin.elevateServerError', {
        defaultValue:
          '服务端内部错误（HTTP 500），通常不是密码错误。请查看运行 1ONE 的终端或日志里 [AuthRoute] enterprise-elevate error 后的报错并重试。',
      });
    }
    if (e.code === 'unknown') {
      const raw = String(e.message ?? '').trim();
      if (
        !raw ||
        raw === 'unknown' ||
        /^verification failed$/i.test(raw)
      ) {
        return t('settings.enterpriseAdmin.elevateFailedUnknown', {
          defaultValue:
            '验证被拒绝。若为多次提交导致限流，请稍后再试；若确认密码无误，请在浏览器开发者工具中查看 POST /api/auth/enterprise-elevate 的 HTTP 状态与返回内容。',
        });
      }
      if (/\bincorrect\s+password\b/i.test(raw)) {
        return t('settings.enterpriseAdmin.elevateIncorrectPassword', {
          defaultValue: '密码错误。请输入当前 WebUI 登录账号的密码；若您使用域账号登录，请选择「域账号 (LDAP)」验证方式。',
        });
      }
      return t('settings.enterpriseAdmin.elevateServerDetail', {
        detail: raw,
        defaultValue: '服务端响应：{{detail}}',
      });
    }
  }
  if (e instanceof Error && e.message) {
    const lower = e.message.toLowerCase();
    if (lower.includes('incorrect password') || lower.includes('password')) {
      return t('settings.enterpriseAdmin.elevateIncorrectPassword', {
        defaultValue: '密码错误。请输入当前 WebUI 登录账号的密码；若您使用域账号登录，请选择「域账号 (LDAP)」验证方式。',
      });
    }
    if (lower.includes('csrf') || lower.includes('forbidden')) {
      return t('settings.enterpriseAdmin.elevateCsrf', {
        defaultValue: '安全校验失败，请刷新页面后重新登录再试。',
      });
    }
    return e.message;
  }
  return t('settings.enterpriseAdmin.elevateFailed', { defaultValue: '验证失败' });
}

export function formatEnterpriseRole(
  role: string | undefined,
  t: TFunction
): string {
  if (role === 'system_admin') {
    return t('settings.enterpriseConsole.roleSystemAdmin', { defaultValue: '系统管理员' });
  }
  if (role === 'org_admin' || role === 'admin') {
    return t('settings.enterpriseConsole.roleOrgAdmin', { defaultValue: '组织管理员' });
  }
  return t('settings.enterpriseConsole.roleMember', { defaultValue: '成员' });
}
