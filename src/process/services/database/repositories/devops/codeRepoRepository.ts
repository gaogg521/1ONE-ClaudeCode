/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import {
  VISIBLE_RESOURCE_WHERE,
  type ScopedResourceRow,
} from '@process/webserver/routes/resourceScope';

export class CodeRepoRepository {
  static async list(
    tenantId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<unknown[]> {
    const db = await getDatabase();
    const driver = db.getDriver();
    if (isAdmin) {
      return driver
        .prepare(`SELECT * FROM code_repos WHERE tenant_id = ? ORDER BY created_at DESC`)
        .all(tenantId) as unknown[];
    }
    return driver
      .prepare(
        `SELECT * FROM code_repos WHERE tenant_id = ? AND ${VISIBLE_RESOURCE_WHERE} ORDER BY created_at DESC`
      )
      .all(tenantId, userId, tenantId, userId) as unknown[];
  }

  static async getScope(id: string, tenantId: string): Promise<ScopedResourceRow | null> {
    const db = await getDatabase();
    const row = db
      .getDriver()
      .prepare(`SELECT scope, team_id, created_by FROM code_repos WHERE id = ? AND tenant_id = ?`)
      .get(id, tenantId) as ScopedResourceRow | undefined;
    return row ?? null;
  }

  static async create(input: {
    id: string;
    tenantId: string;
    name: string;
    url: string;
    provider: string;
    credentialId: string;
    defaultBranch: string;
    scope: string;
    teamId: string | null;
    createdBy: string;
    now: number;
  }): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(
        `INSERT INTO code_repos (id, tenant_id, name, url, provider, credential_id, default_branch, scope, team_id, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        input.id,
        input.tenantId,
        input.name,
        input.url,
        input.provider,
        input.credentialId,
        input.defaultBranch,
        input.scope,
        input.teamId,
        input.createdBy,
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
