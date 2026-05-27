/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { ArtifactRepository } from '@process/services/database/repositories/devops/artifactRepository';

export class CpackService {
  static async listRepos(input: {
    tenantId: string;
    userId: string;
    isAdmin: boolean;
  }): Promise<unknown[]> {
    return ArtifactRepository.listRepos(input.tenantId, input.userId, input.isAdmin);
  }

  static async createRepo(input: {
    tenantId: string;
    name: string;
    repoType?: string;
    endpoint?: string;
    scope: string;
    teamId: string | null;
    createdBy: string;
  }): Promise<{ id: string }> {
    const name = input.name.trim();
    if (!name) {
      throw new Error('name required');
    }
    const id = randomUUID();
    await ArtifactRepository.createRepo({
      id,
      tenantId: input.tenantId,
      name,
      repoType: input.repoType || 'generic',
      endpoint: input.endpoint || '',
      scope: input.scope,
      teamId: input.teamId,
      createdBy: input.createdBy,
      now: Date.now(),
    });
    return { id };
  }

  static async deleteRepo(id: string, tenantId: string): Promise<void> {
    await ArtifactRepository.deleteRepo(id, tenantId);
  }

  static async listArtifacts(input: {
    tenantId: string;
    userId: string;
    isAdmin: boolean;
  }): Promise<unknown[]> {
    return ArtifactRepository.listArtifacts(input.tenantId, input.userId, input.isAdmin);
  }
}
