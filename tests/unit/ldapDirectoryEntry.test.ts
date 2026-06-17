import { describe, expect, it } from 'vitest';
import {
  decodeLdapEscapedUtf8,
  ldapEntryToDirectoryRow,
  parseCnFromDn,
} from '@process/webserver/auth/providers/LdapAuthProvider';

describe('ldap directory entry mapping', () => {
  it('decodes hex-escaped CN in DN to readable UTF-8 (not raw escapes)', () => {
    const dn = 'CN=\\e8\\b5\\81\\e6\\b7\\91\\e8\\8a\\b3,OU=users,DC=intranet,DC=example,DC=com';
    const cn = parseCnFromDn(dn);
    expect(cn).not.toMatch(/\\e[0-9a-f]{2}/i);
    expect(cn.length).toBeGreaterThan(0);
  });

  it('prefers sAMAccountName over DN for username', () => {
    const dn = 'CN=\\e8\\b5\\b5\\e4\\b9\\a6\\e6\\96\\b9,OU=users,DC=intranet,DC=example,DC=com';
    const row = ldapEntryToDirectoryRow(
      dn,
      {
        sAMAccountName: 'shufangzhao',
        displayName: '赵淑芳',
        cn: '赵淑芳',
      } as Record<string, unknown>,
      'sAMAccountName'
    );
    expect(row.username).toBe('shufangzhao');
    expect(row.displayName).toBe('赵淑芳');
    expect(row.orgUnitPath).toBe('users');
    expect(row.username).not.toContain('CN=');
  });

  it('decodeLdapEscapedUtf8 handles plain text', () => {
    expect(decodeLdapEscapedUtf8('zhangsan')).toBe('zhangsan');
  });
});
