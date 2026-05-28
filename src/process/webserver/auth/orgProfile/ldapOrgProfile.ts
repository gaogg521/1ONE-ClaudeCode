/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { decodeLdapEscapedUtf8 } from '@process/webserver/auth/providers/LdapAuthProvider';

function pickAttr(record: Record<string, unknown>, key: string): string {
  const candidates = [key, key.toLowerCase(), key.toUpperCase()];
  for (const candidate of candidates) {
    const raw = record[candidate];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) {
      return raw[0].trim();
    }
  }
  return '';
}

/** Parse OU segments from DN (leaf-to-root) and return root-to-leaf labels. */
export function parseOuChainFromDn(dn: string): string[] {
  const ous: string[] = [];
  for (const part of dn.split(',')) {
    const trimmed = part.trim();
    const match = /^OU=(.+)$/i.exec(trimmed);
    if (match?.[1]) {
      ous.push(decodeLdapEscapedUtf8(match[1]));
    }
  }
  return ous.toReversed();
}

export function resolveLdapOrgUnitPath(dn: string, entry: Record<string, unknown>): string | null {
  const department = pickAttr(entry, 'department');
  const company = pickAttr(entry, 'company');
  const ouPath = parseOuChainFromDn(dn).join(' / ');

  let path = department || ouPath;
  if (!path) {
    return company || null;
  }
  if (company) {
    path = `${company} / ${path}`;
  }
  return path.trim() || null;
}
