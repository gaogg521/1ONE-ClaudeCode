import { describe, expect, it } from 'vitest';
import { shouldBypassCsrfByPath } from '@process/webserver/setup';

describe('webserver CSRF bypass policy', () => {
  it('does not bypass enterprise admin mutation routes', () => {
    expect(shouldBypassCsrfByPath('/api/admin/skills')).toBe(false);
    expect(shouldBypassCsrfByPath('/api/admin/rag/upload')).toBe(false);
  });

  it('keeps explicit auth and generic upload bypasses', () => {
    expect(shouldBypassCsrfByPath('/login')).toBe(true);
    expect(shouldBypassCsrfByPath('/api/auth/qr-login')).toBe(true);
    expect(shouldBypassCsrfByPath('/api/upload/file')).toBe(true);
  });
});
