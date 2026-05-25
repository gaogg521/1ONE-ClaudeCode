/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';

export class ArtifactRepository {
  static async listRepos(tenantId: string): Promise<unknown[]> {
    const db = await getDatabase();
    return db
      .getDriver()
      .prepare(`SELECT * FROM artifact_repos WHERE tenant_id = ? ORDER BY created_at DESC`)
      .all(tenantId) as unknown[];
  }

  static async createRepo(input: {
    id: string;
    tenantId: string;
    name: string;
    repoType: string;
    endpoint: string;
    now: number;
  }): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(
        `INSERT INTO artifact_repos (id, tenant_id, name, repo_type, endpoint, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)`
      )
      .run(input.id, input.tenantId, input.name, input.repoType, input.endpoint, input.now, input.now);
  }

  static async deleteRepo(id: string, tenantId: string): Promise<void> {
    const db = await getDatabase();
    db.getDriver()
      .prepare(`DELETE FROM artifact_repos WHERE id=? AND tenant_id=?`)
      .run(id, tenantId);
  }

  static async listArtifacts(
    tenantId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<unknown[]> {
    const db = await getDatabase();
    const driver = db.getDriver();
    const statement = isAdmin
      ? driver.prepare(
          `SELECT a.*, ar.name as repo_name
           FROM artifacts a
           JOIN artifact_repos ar ON a.repo_id = ar.id
           WHERE ar.tenant_id = ?
           ORDER BY a.created_at DESC`
        )
      : driver.prepare(
          `SELECT a.*, ar.name as repo_name
           FROM artifacts a
           JOIN artifact_repos ar ON a.repo_id = ar.id
           WHERE ar.tenant_id = ?
             AND (a.scope = 'organization' OR a.created_by = ?)
           ORDER BY a.created_at DESC`
        );
    return (isAdmin
      ? statement.all(tenantId)
      : statement.all(tenantId, userId)) as unknown[];
  }
}
