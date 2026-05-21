import { describe, it, expect } from 'vitest';
import { CURRENT_DB_VERSION } from '@process/services/database/schema';
import { ALL_MIGRATIONS } from '@process/services/database/migrations';

describe('database version sync', () => {
  it('CURRENT_DB_VERSION matches the latest migration', () => {
    const latest = Math.max(...ALL_MIGRATIONS.map((m) => m.version));
    expect(CURRENT_DB_VERSION).toBe(latest);
  });
});
