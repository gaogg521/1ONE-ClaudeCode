import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createClientMock,
  serviceClient,
  userClient,
} = vi.hoisted(() => {
  const serviceClient = {
    bind: vi.fn((_principal: string, _password: string, cb: (err?: Error | null) => void) => cb(null)),
    search: vi.fn(
      (
        _baseDN: string,
        _options: unknown,
        cb: (
          err: Error | null,
          res?: {
            on(event: 'searchEntry' | 'error' | 'end', listener: (value?: any) => void): void;
          }
        ) => void
      ) => {
        const listeners: Record<string, (value?: any) => void> = {};
        cb(null, {
          on(event, listener) {
            listeners[event] = listener;
          },
        });
        listeners.searchEntry?.({
          dn: { toString: () => 'CN=1onetest,OU=users,DC=intranet,DC=123u,DC=com' },
          object: {
            messageId: 2,
            protocolOp: 100,
            type: 'SearchResultEntry',
            objectName: 'CN=1onetest,OU=users,DC=intranet,DC=123u,DC=com',
            attributes: [
              { type: 'sAMAccountName', values: ['1onetest'] },
              { type: 'userPrincipalName', values: ['1onetest@intranet.123u.com'] },
            ],
            controls: [],
          },
        });
        listeners.end?.({ status: 0 });
      }
    ),
    unbind: vi.fn(),
  };

  const userClient = {
    bind: vi.fn((principal: string, _password: string, cb: (err?: Error | null) => void) => {
      if (principal === 'CN=1onetest,OU=users,DC=intranet,DC=123u,DC=com') {
        cb(new Error('Invalid Credentials'));
        return;
      }
      if (principal === '1onetest@intranet.123u.com') {
        cb(null);
        return;
      }
      cb(new Error(`unexpected principal: ${principal}`));
    }),
    search: vi.fn(),
    unbind: vi.fn(),
  };

  return {
    createClientMock: vi.fn().mockReturnValueOnce(serviceClient).mockReturnValueOnce(userClient),
    serviceClient,
    userClient,
  };
});

vi.mock('ldapjs', () => ({
  default: {
    createClient: createClientMock,
  },
  createClient: createClientMock,
}));

import { authenticateWithLdap } from '@process/webserver/auth/providers/LdapAuthProvider';

describe('LdapAuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockReset();
    createClientMock.mockReturnValueOnce(serviceClient).mockReturnValueOnce(userClient);
  });

  it('falls back to userPrincipalName when DN bind is rejected', async () => {
    await expect(
      authenticateWithLdap('1onetest', 'tX9#kL2@mQ7$rP5&vN4!wJ6^gM3', {
        url: 'ldap://10.0.150.99',
        baseDN: 'OU=users,OU=123u,DC=intranet,DC=123u,DC=com',
        bindAccount: '1onetest',
        bindPassword: 'tX9#kL2@mQ7$rP5&vN4!wJ6^gM3',
        loginAttribute: 'sAMAccountName',
      })
    ).resolves.toMatchObject({
      externalId: 'CN=1onetest,OU=users,DC=intranet,DC=123u,DC=com',
      userDn: 'CN=1onetest,OU=users,DC=intranet,DC=123u,DC=com',
    });

    expect(userClient.bind).toHaveBeenNthCalledWith(
      1,
      'CN=1onetest,OU=users,DC=intranet,DC=123u,DC=com',
      'tX9#kL2@mQ7$rP5&vN4!wJ6^gM3',
      expect.any(Function)
    );
    expect(userClient.bind).toHaveBeenNthCalledWith(
      2,
      '1onetest@intranet.123u.com',
      'tX9#kL2@mQ7$rP5&vN4!wJ6^gM3',
      expect.any(Function)
    );
  });
});
