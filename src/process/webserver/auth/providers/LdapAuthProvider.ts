/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import ldap from 'ldapjs';
import type { SearchEntryObject } from 'ldapjs';

import { PASSWORD_MASK } from '@/common/config/constants';
import { resolveLdapOrgUnitPath } from '@process/webserver/auth/orgProfile/ldapOrgProfile';

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
  orgUnitPath?: string;
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
  return Boolean(principal && pwd && pwd !== PASSWORD_MASK);
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

/** Decode ldapjs DN / attribute hex escapes (e.g. CN=\\e8\\b5\\b5 → 赵). */
function decodeLdapEscapedUtf8(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!/\\[0-9a-fA-F]{2}/.test(trimmed)) {
    return trimmed.replace(/\\([\\,#+<>;"=])/g, '$1');
  }
  const bytes: number[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && i + 2 < trimmed.length) {
      const hex = trimmed.slice(i + 1, i + 3);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(Number.parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(trimmed.charCodeAt(i));
  }
  try {
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return trimmed;
  }
}

function parseCnFromDn(dn: string): string {
  const match = dn.match(/(?:^|,)CN=([^,]+)/i);
  if (!match?.[1]) return '';
  return decodeLdapEscapedUtf8(match[1]);
}

function resolveLoginAttribute(config: LdapProviderConfig): string {
  const raw = (config.loginAttribute || 'sAMAccountName').trim();
  if (!raw || raw.toLowerCase() === 'dn') return 'sAMAccountName';
  return raw;
}

function ldapAttributesToRecord(entry: unknown): Record<string, unknown> {
  const e = entry as {
    object?: Record<string, unknown>;
    pojo?: Record<string, unknown>;
    attributes?: Array<{ type?: string; values?: string[]; vals?: string[] }>;
  };
  const legacy = e.pojo ?? e.object;
  const record: Record<string, unknown> =
    legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0 ? { ...legacy } : {};
  const attrs =
    e.attributes ??
    ((e.object as { attributes?: Array<{ type?: string; values?: string[]; vals?: string[] }> } | undefined)
      ?.attributes ??
      (e.pojo as { attributes?: Array<{ type?: string; values?: string[]; vals?: string[] }> } | undefined)
        ?.attributes);
  if (!Array.isArray(attrs)) return record;

  for (const attr of attrs) {
    const type = String(attr.type ?? '').trim();
    if (!type) continue;
    const vals = attr.values ?? attr.vals ?? [];
    const normalized = (Array.isArray(vals) ? vals : [vals]).map((v) => String(v).trim()).filter(Boolean);
    if (normalized.length === 0) continue;
    const value = normalized.length === 1 ? normalized[0] : normalized;
    record[type] = value;
    const lower = type.toLowerCase();
    if (!(lower in record)) record[lower] = value;
  }
  return record;
}

function readEntryObject(entry: unknown): { dn: string; entry: SearchEntryObject } {
  const e = entry as {
    dn?: { toString(): string };
    objectName?: { toString(): string } | string;
  };
  const dn =
    e.dn?.toString?.() ??
    (typeof e.objectName === 'string' ? e.objectName : e.objectName?.toString?.()) ??
    '';
  return { dn, entry: ldapAttributesToRecord(entry) as unknown as SearchEntryObject };
}

function pickAttr(record: Record<string, unknown>, key: string): string {
  const candidates = [key, key.toLowerCase(), key.toUpperCase()];
  for (const k of candidates) {
    const arr = toArray(record[k]);
    const s = arr[0]?.trim() ?? '';
    if (s) return s;
  }
  return '';
}

function isInvalidCredentialError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /invalidcredentials|invalid credentials/i.test(message);
}

function ldapEntryToDirectoryRow(
  dn: string,
  entry: SearchEntryObject,
  loginAttr: string
): LdapDirectoryEntry {
  const record = entry as unknown as Record<string, unknown>;
  const mail = pickAttr(record, 'mail');
  const sam = pickAttr(record, 'sAMAccountName');
  const upn = pickAttr(record, 'userPrincipalName');
  const cnDecoded = decodeLdapEscapedUtf8(pickAttr(record, 'cn')) || parseCnFromDn(dn);
  const displayName = pickAttr(record, 'displayName') || cnDecoded || undefined;

  const username =
    sam ||
    (loginAttr.toLowerCase() !== 'samaccountname' ? pickAttr(record, loginAttr) : '') ||
    (upn.includes('@') ? upn.split('@')[0] : upn) ||
    pickAttr(record, 'uid') ||
    (mail.includes('@') ? mail.split('@')[0] : '') ||
    cnDecoded ||
    '';

  if (!username) {
    throw Object.assign(new Error('LDAP entry is missing sAMAccountName/cn — cannot provision a local login name'), {
      code: 'LDAP_ENTRY_MISSING_LOGIN',
    });
  }

  return {
    dn,
    username,
    displayName,
    mail: mail || undefined,
    orgUnitPath: resolveLdapOrgUnitPath(dn, record) ?? undefined,
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

  const loginAttr = resolveLoginAttribute(config);
  const safe = escapeLdapFilterValue(q);
  const filter = `(&(|(objectClass=user)(objectClass=person)(objectClass=inetOrgPerson)(objectClass=organizationalPerson))(|(${loginAttr}=*${safe}*)(sAMAccountName=*${safe}*)(cn=*${safe}*)(displayName=*${safe}*)(sn=*${safe}*)(givenName=*${safe}*)(mail=*${safe}*)(userPrincipalName=*${safe}*)))`;
  const attrs = Array.from(
    new Set(['dn', loginAttr, 'sAMAccountName', 'userPrincipalName', 'uid', 'cn', 'displayName', 'mail', 'department', 'company'])
  );

  const bindPrincipal = resolveLdapBindPrincipal(config);
  const bindPassword = String(config.bindPassword ?? '').trim();
  if (!bindPrincipal || !bindPassword || bindPassword === PASSWORD_MASK) {
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
  orgUnitPath: string | null;
  debug?: { memberOf?: string[] };
}> {
    const loginAttr = resolveLoginAttribute(config);
    const defaultFilter = username.includes('@')
      ? `(|(${loginAttr}={{username}})(userPrincipalName={{username}})(mail={{username}}))`
      : `(|(${loginAttr}={{username}})(sAMAccountName={{username}})(uid={{username}}))`;
    const rawFilter = (config.searchFilter || defaultFilter).trim();
    const safeUser = escapeLdapFilterValue(username.trim());
    const filter = rawFilter.replace(/\{\{\s*username\s*\}\}/gi, safeUser);
    const attrs = Array.from(
      new Set(['dn', loginAttr, 'memberOf', 'department', 'company', ...(config.externalIdAttribute ? [config.externalIdAttribute] : [])])
    );

    // 1) service bind (optional) + search user dn
    const serviceClient = createClient(config);
    try {
      const bindPrincipal = resolveLdapBindPrincipal(config);
      if (bindPrincipal && config.bindPassword && String(config.bindPassword).trim() !== PASSWORD_MASK) {
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
        try {
          await bindAsync(userClient, userDn, password);
        } catch (error) {
          const userPrincipalName = pickAttr(entryRecord, 'userPrincipalName');
          const loginPrincipal = pickAttr(entryRecord, loginAttr);
          const fallbackPrincipal = userPrincipalName || loginPrincipal;
          if (!isInvalidCredentialError(error) || !fallbackPrincipal || fallbackPrincipal === userDn) {
            throw error;
          }
          await bindAsync(userClient, fallbackPrincipal, password);
        }
      } finally {
        unbindSafe(userClient);
      }

      return {
        externalId,
        isAdmin,
        userDn,
        orgUnitPath: resolveLdapOrgUnitPath(userDn, entryRecord),
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
    if (!bindPassword || bindPassword === PASSWORD_MASK) {
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

export function formatLdapConnectionError(
  error: unknown,
  config?: Pick<LdapProviderConfig, 'url'>
): string {
  const err = error as { code?: string; message?: string };
  const code = String(err?.code ?? '').toUpperCase();
  const message = error instanceof Error ? error.message : String(error);
  let hostname = '';
  if (config?.url) {
    try {
      hostname = new URL(config.url).hostname;
    } catch {
      hostname = '';
    }
  }
  if (code === 'ENOTFOUND' || message.toLowerCase().includes('enotfound')) {
    return hostname
      ? `无法解析 LDAP 主机「${hostname}」。请确认域控地址、VPN/内网 DNS 是否正常；主机名应填写实际 FQDN（如 intranet.example.com），不要把 ldaps:// 写进主机框。`
      : '无法解析 LDAP 主机名，请检查域控地址、VPN/内网 DNS。';
  }
  if (code === 'ECONNREFUSED' || message.toLowerCase().includes('connection refused')) {
    return '无法连接 LDAP 服务，请检查端口与是否启用 TLS（389/636）。';
  }
  if (code === 'ETIMEDOUT' || message.toLowerCase().includes('timeout')) {
    return '连接 LDAP 超时，请检查网络或防火墙。';
  }
  return message;
}

export { decodeLdapEscapedUtf8, parseCnFromDn, ldapEntryToDirectoryRow };

