import { describe, expect, it } from 'vitest';
import {
  mergeEnterpriseApiOrigins,
  normalizeEnterpriseApiOrigin,
  shouldSyncWithEnterpriseApi,
} from '@/common/config/enterpriseApiOrigins';

describe('enterpriseApiOrigins', () => {
  it('normalizes and dedupes origins', () => {
    const merged = mergeEnterpriseApiOrigins(
      ['https://one.example.com'],
      ['https://one.example.com/', 'http://192.168.1.9:25809']
    );
    expect(merged).toEqual(['https://one.example.com', 'http://192.168.1.9:25809']);
  });

  it('rejects invalid origins', () => {
    expect(normalizeEnterpriseApiOrigin('not-a-url')).toBeNull();
  });

  it('enables org sync only for real enterprise tenants', () => {
    expect(shouldSyncWithEnterpriseApi('default')).toBe(false);
    expect(shouldSyncWithEnterpriseApi('tenant-acme')).toBe(true);
  });
});
