import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetProvider = vi.hoisted(() => vi.fn());

vi.mock('@process/webserver/auth/repository/AuthProviderRepository', () => ({
  AuthProviderRepository: {
    getProvider: mockGetProvider,
  },
}));

const ORIGINAL_ENV = {
  ONE_SMTP_HOST: process.env.ONE_SMTP_HOST,
  ONE_SMTP_PORT: process.env.ONE_SMTP_PORT,
  ONE_SMTP_USER: process.env.ONE_SMTP_USER,
  ONE_SMTP_PASS: process.env.ONE_SMTP_PASS,
  ONE_SMTP_FROM: process.env.ONE_SMTP_FROM,
  ONE_SMTP_SECURE: process.env.ONE_SMTP_SECURE,
};

function restoreSmtpEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('smtpConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreSmtpEnv();
  });

  it('prefers the enabled SMTP provider config over ONE_SMTP_* environment variables', async () => {
    process.env.ONE_SMTP_HOST = 'env.smtp.example.com';
    process.env.ONE_SMTP_PORT = '587';
    process.env.ONE_SMTP_USER = 'env-user';
    process.env.ONE_SMTP_PASS = 'env-pass';
    process.env.ONE_SMTP_FROM = 'env@example.com';
    process.env.ONE_SMTP_SECURE = 'false';

    mockGetProvider.mockResolvedValue({
      provider: 'smtp',
      enabled: true,
      config: {
        host: 'db.smtp.example.com',
        port: '465',
        user: 'db-user',
        pass: 'db-pass',
        from: 'db@example.com',
        secure: true,
      },
    });

    const { resolveSmtpConfig } = await import('@process/webserver/auth/smtpConfig');

    await expect(resolveSmtpConfig()).resolves.toEqual({
      host: 'db.smtp.example.com',
      port: 465,
      secure: true,
      user: 'db-user',
      pass: 'db-pass',
      from: 'db@example.com',
    });
  });

  it('falls back to ONE_SMTP_* environment variables when the provider is disabled', async () => {
    process.env.ONE_SMTP_HOST = 'env.smtp.example.com';
    process.env.ONE_SMTP_PORT = '587';
    process.env.ONE_SMTP_USER = 'env-user';
    process.env.ONE_SMTP_PASS = 'env-pass';
    process.env.ONE_SMTP_FROM = 'env@example.com';
    process.env.ONE_SMTP_SECURE = 'false';

    mockGetProvider.mockResolvedValue({
      provider: 'smtp',
      enabled: false,
      config: {
        host: 'db.smtp.example.com',
        port: '465',
        user: 'db-user',
        pass: 'db-pass',
        from: 'db@example.com',
        secure: true,
      },
    });

    const { resolveSmtpConfig } = await import('@process/webserver/auth/smtpConfig');

    await expect(resolveSmtpConfig()).resolves.toEqual({
      host: 'env.smtp.example.com',
      port: 587,
      secure: false,
      user: 'env-user',
      pass: 'env-pass',
      from: 'env@example.com',
    });
  });
});
