/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import ldap from 'ldapjs';
import type { SearchEntryObject } from 'ldapjs';

export type LdapProviderConfig = {
  url: string;
  baseDN: string;
  bindDN?: string;
  bindPassword?: string;
  loginAttribute?: string; // AD: sAMAccountName/userPrincipalName, OpenLDAP: uid
  searchFilter?: string; // supports {{username}}
  externalIdAttribute?: string; // if empty, use DN
  adminGroupDN?: string; // if set, memberOf includes this DN => admin
  tlsRejectUnauthorized?: boolean;
  timeoutMs?: number;
};

function escapeLdapFilterValue(value: string): string {
  // Basic LDAP filter escaping
  return value
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29');
}

function normalizeDn(dn: string): string {
  return String(dn || '').trim().toLowerCase();
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') return [value];
  if (value === undefined || value === null) return [];
  return [String(value)];
}

function createClient(config: LdapProviderConfig): ldap.Client {
  const timeout = typeof config.timeoutMs === 'number' && config.timeoutMs > 0 ? config.timeoutMs : 10_000;
  return ldap.createClient({
    url: config.url,
    timeout,
    connectTimeout: timeout,
    tlsOptions:
      config.url.startsWith('ldaps://') || config.url.includes('://')
        ? {
            rejectUnauthorized: config.tlsRejectUnauthorized !== false,
          }
        : undefined,
  });
}

function bindAsync(client: ldap.Client, dn: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function unbindSafe(client: ldap.Client): void {
  try {
    client.unbind();
  } catch {}
}

function searchUserAsync(
  client: ldap.Client,
  baseDN: string,
  filter: string,
  attributes: string[]
): Promise<{ dn: string; entry: SearchEntryObject }> {
  return new Promise((resolve, reject) => {
    const opts: ldap.SearchOptions = {
      scope: 'sub',
      filter,
      sizeLimit: 2,
      attributes,
    };

    client.search(baseDN, opts, (err, res) => {
      if (err) {
        reject(err);
        return;
      }

      let found: { dn: string; entry: SearchEntryObject } | null = null;

      res.on('searchEntry', (entry) => {
        if (found) return;
        found = { dn: entry.dn.toString(), entry: entry.object as SearchEntryObject };
      });
      res.on('error', (error) => reject(error));
      res.on('end', (result) => {
        if (!found) {
          reject(Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND' }));
          return;
        }
        if (result?.status !== 0) {
          reject(Object.assign(new Error(`LDAP search ended with status ${result.status}`), { code: 'LDAP_SEARCH_FAILED' }));
          return;
        }
        resolve(found);
      });
    });
  });
}

export async function authenticateWithLdap(
  username: string,
  password: string,
  config: LdapProviderConfig
): Promise<{
  externalId: string;
  isAdmin: boolean;
  userDn: string;
  debug?: { memberOf?: string[] };
}> {
    const loginAttr = (config.loginAttribute || 'uid').trim();
    const rawFilter = (config.searchFilter || `(${loginAttr}={{username}})`).trim();
    const safeUser = escapeLdapFilterValue(username.trim());
    const filter = rawFilter.replace(/\{\{\s*username\s*\}\}/gi, safeUser);
    const attrs = Array.from(new Set(['dn', loginAttr, 'memberOf', ...(config.externalIdAttribute ? [config.externalIdAttribute] : [])]));

    // 1) service bind (optional) + search user dn
    const serviceClient = createClient(config);
    try {
      if (config.bindDN && config.bindPassword) {
        await bindAsync(serviceClient, config.bindDN, config.bindPassword);
      }
      const { dn: userDn, entry } = await searchUserAsync(serviceClient, config.baseDN, filter, attrs);
      const entryRecord = entry as unknown as Record<string, unknown>;
      const memberOf = toArray(entryRecord.memberOf);
      const isAdmin = Boolean(config.adminGroupDN && memberOf.map(normalizeDn).includes(normalizeDn(config.adminGroupDN)));

      const externalId = (() => {
        const key = (config.externalIdAttribute || '').trim();
        if (key) {
          const v = entryRecord[key];
          const arr = toArray(v);
          if (arr.length > 0 && arr[0].trim() !== '') return arr[0].trim();
        }
        return userDn;
      })();

      // 2) verify password by binding as user
      const userClient = createClient(config);
      try {
        await bindAsync(userClient, userDn, password);
      } finally {
        unbindSafe(userClient);
      }

      return {
        externalId,
        isAdmin,
        userDn,
        debug: { memberOf },
      };
    } finally {
      unbindSafe(serviceClient);
    }
}

