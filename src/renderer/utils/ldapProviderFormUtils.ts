/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type LdapTransportMode = 'plain' | 'ldaps';

export const LDAP_DEFAULT_PORT: Record<LdapTransportMode, string> = {
  plain: '389',
  ldaps: '636',
};

export type LdapConnectionFields = {
  host: string;
  port: string;
  useTls: boolean;
};

/** Parse persisted `url` into host / port / TLS mode. */
export function parseLdapUrl(url: string): LdapConnectionFields {
  const trimmed = url.trim();
  if (!trimmed) {
    return { host: '', port: LDAP_DEFAULT_PORT.plain, useTls: false };
  }

  try {
    const normalized = trimmed.includes('://') ? trimmed : `ldap://${trimmed}`;
    const parsed = new URL(normalized);
    const useTls = parsed.protocol === 'ldaps:';
    const transport: LdapTransportMode = useTls ? 'ldaps' : 'plain';
    return {
      host: parsed.hostname,
      port: parsed.port || LDAP_DEFAULT_PORT[transport],
      useTls,
    };
  } catch {
    const withoutScheme = trimmed.replace(/^ldaps?:\/\//i, '');
    const [hostPart, portPart] = withoutScheme.split(':');
    const useTls = /^ldaps:/i.test(trimmed);
    const transport: LdapTransportMode = useTls ? 'ldaps' : 'plain';
    return {
      host: (hostPart ?? '').trim(),
      port: (portPart ?? '').trim() || LDAP_DEFAULT_PORT[transport],
      useTls,
    };
  }
}

/** Build `ldap://` or `ldaps://` URL stored in provider config. */
export function buildLdapUrl(fields: LdapConnectionFields): string {
  const host = fields.host.trim();
  if (!host) return '';

  const useTls = fields.useTls;
  const scheme = useTls ? 'ldaps' : 'ldap';
  const port = fields.port.trim() || LDAP_DEFAULT_PORT[useTls ? 'ldaps' : 'plain'];
  return `${scheme}://${host}:${port}`;
}
