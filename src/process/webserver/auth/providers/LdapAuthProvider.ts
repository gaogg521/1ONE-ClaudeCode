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
  /** Full bind DN / UPN used for ldap.bind (preferred when set). */
  bindDN?: string;
  /** sAMAccountName, DOMAIN\\user, or user@domain when bindDN is empty. */
  bindAccount?: string;
  bindPassword?: string;
  loginAttribute?: string; // AD: sAMAccountName/userPrincipalName, OpenLDAP: uid
  searchFilter?: string; // supports {{username}}
  externalIdAttribute?: string; // if empty, use DN
  adminGroupDN?: string; // if set, memberOf includes this DN => admin
  tlsRejectUnauthorized?: boolean;
  timeoutMs?: number;
};

/** One row from admin LDAP directory search (not yet a local user). */
export type LdapDirectoryEntry = {
  dn: string;
  username: string;
  displayName?: string;
  mail?: string;
};

/** Minimal typing for ldapjs search callback result stream (no @types/ldapjs). */
type LdapSearchStream = {
  on(event: 'searchEntry', listener: () => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  on(event: 'end', listener: (result?: { status?: number }) => void): void;
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

/** `DC=intranet,DC=example,DC=com` → `intranet.example.com` */
function baseDnToDnsDomain(baseDN: string): string | null {
  const parts = baseDN
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /^dc=/i.test(p))
    .map((p) => p.split('=').slice(1).join('=').trim())
    .filter((label) => label.length > 0);
  if (parts.length === 0) return null;
  return parts.join('.');
}

/**
 * LDAP bind principal: prefer explicit bindDN; else bindAccount (UPN / DOMAIN\\user / sAMAccountName + inferred domain).
 */
export function resolveLdapBindPrincipal(config: LdapProviderConfig): string {
  const bindDN = String(config.bindDN ?? '').trim();
  if (bindDN) return bindDN;

  const bindAccount = String(config.bindAccount ?? '').trim();
  if (!bindAccount) return '';
  if (bindAccount.includes('@') || bindAccount.includes('\\')) return bindAccount;

  const domain = baseDnToDnsDomain(String(config.baseDN ?? '').trim());
  if (domain) return `${bindAccount}@${domain}`;
  return bindAccount;
}

export function hasLdapServiceBind(config: LdapProviderConfig): boolean {
  const principal = resolveLdapBindPrincipal(config);
  const pwd = String(config.bindPassword ?? '').trim();
  return Boolean(principal && pwd && pwd !== '******');
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
    tlsOptions: config.url.startsWith('ldaps://')
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

function readEntryObject(entry: unknown): { dn: string; entry: SearchEntryObject } {
  const e = entry as {
    dn: { toString(): string };
    object?: unknown;
    pojo?: unknown;
  };
  return { dn: e.dn.toString(), entry: (e.pojo ?? e.object ?? {}) as SearchEntryObject };
}

function ldapEntryToDirectoryRow(
  dn: string,
  entry: SearchEntryObject,
  loginAttr: string
): LdapDirectoryEntry {
  const record = entry as unknown as Record<string, unknown>;
  const pick = (key: string): string => {
    const v = record[key];
    const arr = toArray(v);
    return arr[0]?.trim() ?? '';
  };
  const mail = pick('mail');
  const username =
    pick(loginAttr) ||
    pick('sAMAccountName') ||
    pick('userPrincipalName').split('@')[0] ||
    pick('uid') ||
    pick('cn') ||
    (mail.includes('@') ? mail.split('@')[0] : '') ||
    dn;
  return {
    dn,
    username,
    displayName: pick('displayName') || pick('cn') || undefined,
    mail: mail || undefined,
  };
}

function searchUsersAsync(
  client: ldap.Client,
  baseDN: string,
  filter: string,
  attributes: string[],
  sizeLimit: number
): Promise<Array<{ dn: string; entry: SearchEntryObject }>> {
  return new Promise((resolve, reject) => {
    const opts: ldap.SearchOptions = {
      scope: 'sub',
      filter,
      sizeLimit,
      attributes,
    };

    const found: Array<{ dn: string; entry: SearchEntryObject }> = [];

    client.search(baseDN, opts, (err, res) => {
      if (err) {
        reject(err);
        return;
      }

      res.on('searchEntry', (entry) => {
        if (found.length >= sizeLimit) return;
        found.push(readEntryObject(entry));
      });
      res.on('error', (error) => reject(error));
      res.on('end', (result) => {
        if (result?.status !== undefined && result.status !== 0) {
          reject(Object.assign(new Error(`LDAP search ended with status ${result.status}`), { code: 'LDAP_SEARCH_FAILED' }));
          return;
        }
        resolve(found);
      });
    });
  });
}

function searchUserAsync(
  client: ldap.Client,
  baseDN: string,
  filter: string,
  attributes: string[]
): Promise<{ dn: string; entry: SearchEntryObject }> {
  return searchUsersAsync(client, baseDN, filter, attributes, 2).then((rows) => {
    const found = rows[0];
    if (!found) {
      throw Object.assign(new Error('User not found'), { code: 'USER_NOT_FOUND' });
    }
    return found;
  });
}

/**
 * Admin directory lookup: prefix/substring match on login attribute, cn, mail.
 */
export async function searchLdapDirectory(
  config: LdapProviderConfig,
  query: string,
  limit = 20
): Promise<LdapDirectoryEntry[]> {
  const q = query.trim();
  if (!q) return [];

  const url = String(config.url ?? '').trim();
  const baseDN = String(config.baseDN ?? '').trim();
  if (!url || !baseDN) {
    throw Object.assign(new Error('LDAP is not configured'), { code: 'LDAP_NOT_CONFIGURED' });
  }

  const loginAttr = (config.loginAttribute || 'sAMAccountName').trim();
  const safe = escapeLdapFilterValue(q);
  const filter = `(&(|(objectClass=user)(objectClass=person)(objectClass=inetOrgPerson))(|(${loginAttr}=*${safe}*)(cn=*${safe}*)(mail=*${safe}*)(userPrincipalName=*${safe}*)))`;
  const attrs = Array.from(
    new Set(['dn', loginAttr, 'sAMAccountName', 'userPrincipalName', 'uid', 'cn', 'displayName', 'mail'])
  );

  const bindPrincipal = resolveLdapBindPrincipal(config);
  const bindPassword = String(config.bindPassword ?? '').trim();
  if (!bindPrincipal || !bindPassword || bindPassword === '******') {
    throw Object.assign(new Error('Bind DN (or bind account) and password are required for directory search'), {
      code: 'LDAP_SEARCH_MISSING_BIND',
    });
  }
  const client = createClient(config);

  try {
    await bindAsync(client, bindPrincipal, bindPassword);
    const rows = await searchUsersAsync(client, baseDN, filter, attrs, Math.min(Math.max(limit, 1), 50));
    return rows.map((r) => ldapEntryToDirectoryRow(r.dn, r.entry, loginAttr));
  } finally {
    unbindSafe(client);
  }
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
      const bindPrincipal = resolveLdapBindPrincipal(config);
      if (bindPrincipal && config.bindPassword) {
        await bindAsync(serviceClient, bindPrincipal, String(config.bindPassword));
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

/**
 * Verifies LDAP connectivity: optional service bind, then a base-object search on `baseDN`.
 */
export async function testLdapConnection(config: LdapProviderConfig): Promise<void> {
  const url = String(config.url ?? '').trim();
  const baseDN = String(config.baseDN ?? '').trim();
  if (!url) {
    throw Object.assign(new Error('LDAP URL is required'), { code: 'LDAP_TEST_MISSING_URL' });
  }
  if (!baseDN) {
    throw Object.assign(new Error('Base DN is required'), { code: 'LDAP_TEST_MISSING_BASE' });
  }

  const bindPrincipal = resolveLdapBindPrincipal(config);
  const bindPassword = String(config.bindPassword ?? '').trim();
  const client = createClient(config);

  try {
    if (!bindPrincipal) {
      throw Object.assign(
        new Error('Bind DN or LDAP bind account is required (Base DN alone cannot authenticate directory search)'),
        { code: 'LDAP_TEST_MISSING_BIND' }
      );
    }
    if (!bindPassword || bindPassword === '******') {
      throw Object.assign(new Error('Bind password is required for connection test'), {
        code: 'LDAP_TEST_MISSING_BIND_PASSWORD',
      });
    }
    await bindAsync(client, bindPrincipal, bindPassword);

    await new Promise<void>((resolve, reject) => {
      client.search(
        baseDN,
        {
          scope: 'base',
          filter: '(objectClass=*)',
          sizeLimit: 1,
        },
        (err: Error | null, res: LdapSearchStream | undefined): void => {
          if (err) {
            reject(err);
            return;
          }
          if (!res) {
            reject(new Error('LDAP search: missing response'));
            return;
          }
          res.on('searchEntry', () => {});
          res.on('error', reject);
          res.on('end', (result) => {
            if (result?.status !== undefined && result.status !== 0) {
              reject(new Error(`LDAP search ended with status ${result.status}`));
              return;
            }
            resolve();
          });
        }
      );
    });
  } finally {
    unbindSafe(client);
  }
}

