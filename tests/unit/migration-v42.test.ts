import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initSchema } from '@process/services/database/schema';
import { runMigrations } from '@process/services/database/migrations';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';

let nativeModuleAvailable = true;
try {
  const driver = new BetterSqlite3Driver(':memory:');
  driver.close();
} catch (error) {
  if (error instanceof Error && error.message.includes('NODE_MODULE_VERSION')) {
    nativeModuleAvailable = false;
  }
}

const describeOrSkip = nativeModuleAvailable ? describe : describe.skip;

describeOrSkip('migration v42: backfill scoped repo ownership', () => {
  let driver: BetterSqlite3Driver;

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    initSchema(driver);
    runMigrations(driver, 0, 41);

    const now = Date.now();
    driver
      .prepare(
        `INSERT INTO users (id, tenant_id, username, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run('admin-1', 'tenant-a', 'admin', 'hash', 'org_admin', now, now);
    driver
      .prepare(
        `INSERT INTO artifact_repos (id, tenant_id, name, repo_type, endpoint, scope, team_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('repo-1', 'tenant-a', 'legacy-repo', 'generic', '', 'personal', null, '', now, now);
    driver
      .prepare(
        `INSERT INTO code_repos (id, tenant_id, name, url, provider, credential_id, default_branch, scope, team_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'code-1',
        'tenant-a',
        'legacy-code',
        'https://git.example/a',
        'gitlab',
        '',
        'main',
        'personal',
        null,
        '',
        now,
        now
      );
    driver
      .prepare(
        `INSERT INTO artifacts (id, repo_id, name, version, file_size, checksum, scope, team_id, created_by, download_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('artifact-1', 'repo-1', 'pkg', '1.0.0', 10, 'abc', 'personal', null, '', 0, now);
  });

  afterEach(() => {
    driver.close();
  });

  it('backfills created_by from tenant admin and propagates artifact ownership', () => {
    runMigrations(driver, 41, 42);

    const repo = driver.prepare(`SELECT created_by FROM artifact_repos WHERE id = ?`).get('repo-1') as {
      created_by: string;
    };
    const codeRepo = driver.prepare(`SELECT created_by FROM code_repos WHERE id = ?`).get('code-1') as {
      created_by: string;
    };
    const artifact = driver.prepare(`SELECT created_by FROM artifacts WHERE id = ?`).get('artifact-1') as {
      created_by: string;
    };

    expect(repo.created_by).toBe('admin-1');
    expect(codeRepo.created_by).toBe('admin-1');
    expect(artifact.created_by).toBe('admin-1');
  });
});
