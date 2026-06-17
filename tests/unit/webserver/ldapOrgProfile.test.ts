import { describe, expect, it } from 'vitest';
import { parseOuChainFromDn, resolveLdapOrgUnitPath } from '@process/webserver/auth/orgProfile/ldapOrgProfile';

describe('ldapOrgProfile', () => {
  it('builds org path from OU chain in DN', () => {
    expect(parseOuChainFromDn('CN=Alice,OU=Platform,OU=Engineering,DC=corp,DC=com')).toEqual([
      'Engineering',
      'Platform',
    ]);
    expect(resolveLdapOrgUnitPath('CN=Alice,OU=Platform,OU=Engineering,DC=corp,DC=com', {})).toBe(
      'Engineering / Platform'
    );
  });

  it('prefers department attribute and prefixes company', () => {
    expect(
      resolveLdapOrgUnitPath('CN=Alice,OU=users,DC=corp,DC=com', {
        department: '平台组',
        company: 'Acme',
      })
    ).toBe('Acme / 平台组');
  });
});
