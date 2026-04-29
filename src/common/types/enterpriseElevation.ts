/**
 * Enterprise admin secondary verification — shared API contracts (GET/POST + future OAuth).
 * DB auth_providers / auth_identities already support arbitrary provider TEXT keys; extend AuthProviderType when adding DingTalk/WeCom configs.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** Password-based POST /api/auth/enterprise-elevate body.method */
export type EnterpriseElevationPasswordMethod = 'auto' | 'local_password' | 'ldap';

/** Shown in GET …/enterprise-elevation secondaryMethods (pick one when multiple exist). */
export type EnterpriseElevationSecondaryId =
  | 'local_password'
  | 'ldap'
  | 'feishu'
  | 'dingtalk'
  | 'wecom';

export type EnterpriseElevationSecondaryKind = 'password' | 'oauth';

export type EnterpriseElevationSecondaryOption = {
  id: EnterpriseElevationSecondaryId;
  kind: EnterpriseElevationSecondaryKind;
  /** User may attempt this path now (provider enabled, binding when required, handler implemented). */
  available: boolean;
};

/** OAuth elevation via POST is added per provider (e.g. exchange code after OAuth redirect). Reserved IDs. */
export type EnterpriseElevationOAuthProviderId = Extract<
  EnterpriseElevationSecondaryId,
  'feishu' | 'dingtalk' | 'wecom'
>;
