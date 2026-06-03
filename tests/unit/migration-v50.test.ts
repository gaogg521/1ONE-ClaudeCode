import { describe, expect, it } from 'vitest';
import { ALL_MIGRATIONS, getMigrationsToRun } from '@process/services/database/migrations';

describe('migration v50 team runtime nodes', () => {
  it('includes team_runtime_nodes migration after v49', () => {
    const migration = ALL_MIGRATIONS.find((item) => item.version === 50);
    expect(migration?.name).toContain('team runtime');
    const chain = getMigrationsToRun(49, 50);
    expect(chain).toHaveLength(1);
    expect(chain[0]?.version).toBe(50);
  });
});
