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

describeOrSkip('migration v49: normalize legacy organization resource scopes', () => {
  let driver: BetterSqlite3Driver;

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    initSchema(driver);
    runMigrations(driver, 0, 48);

    const now = Date.now();
    driver
      .prepare(
        `INSERT INTO rag_documents (id, tenant_id, title, file_path, file_size, mime_type, status, scope, team_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('rag-1', 'tenant-a', 'Legacy RAG', '/tmp/a.md', 1, 'text/markdown', 'completed', 'tenant', null, 'user-1', now, now);
    driver
      .prepare(
        `INSERT INTO mcp_registry (id, tenant_id, name, type, endpoint, env_json, enabled, scope, team_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('mcp-1', 'tenant-a', 'Legacy MCP', 'sse', 'https://example.com', '{}', 1, 'org', null, 'user-1', now, now);
    driver
      .prepare(
        `INSERT INTO skills_registry (id, tenant_id, name, description, content, enabled, scope, team_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run('skill-1', 'tenant-a', 'Legacy Skill', '', '', 1, 'tenant', null, 'user-1', now, now);
  });

  afterEach(() => {
    driver.close();
  });

  it('backfills tenant/org scopes to organization', () => {
    runMigrations(driver, 48, 49);

    expect((driver.prepare(`SELECT scope FROM rag_documents WHERE id = ?`).get('rag-1') as { scope: string }).scope).toBe('organization');
    expect((driver.prepare(`SELECT scope FROM mcp_registry WHERE id = ?`).get('mcp-1') as { scope: string }).scope).toBe('organization');
    expect((driver.prepare(`SELECT scope FROM skills_registry WHERE id = ?`).get('skill-1') as { scope: string }).scope).toBe('organization');
  });
});
