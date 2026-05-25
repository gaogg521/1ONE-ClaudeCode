/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';

export class CodeRepoRepository {
  static async list(tenantId: string): Promise<unknown[]> {
    const db = await getDatabase();
    return db
      .getDriver()
      .prepare(`SELECT * FROM code_repos WHERE tenant_id = ? ORDER BY created_at DESC`)
      .all(tenantId) as unknown[];
  }

  static async create(input: {
    id: string;
    tenantId: string;
    name: string;
    url: string;
    provider: string;
    credentialId: string;
    defaultBranch: string;
    now: number;
  }): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(
        `INSERT INTO code_repos (id, tenant_id, name, url, provider, credential_id, default_branch, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.tenantId,
        input.name,
        input.url,
        input.provider,
        input.credentialId,
        input.defaultBranch,
        input.now,
        input.now
      );
  }

  static async delete(id: string, tenantId: string): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(`DELETE FROM code_repos WHERE id=? AND tenant_id=?`)
      .run(id, tenantId);
  }
}
