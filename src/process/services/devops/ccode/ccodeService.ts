/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { CodeRepoRepository } from '@process/services/database/repositories/devops/codeRepoRepository';

export class CcodeService {
  static async listRepos(tenantId: string): Promise<unknown[]> {
    return CodeRepoRepository.list(tenantId);
  }

  static async createRepo(input: {
    tenantId: string;
    name: string;
    url: string;
    provider?: string;
    credentialId?: string;
    defaultBranch?: string;
  }): Promise<{ id: string }> {
    const name = input.name.trim();
    const url = input.url.trim();
    if (!name || !url) {
      throw new Error('name and url required');
    }
    const id = randomUUID();
    await CodeRepoRepository.create({
      id,
      tenantId: input.tenantId,
      name,
      url,
      provider: input.provider || 'gitlab',
      credentialId: input.credentialId || '',
      defaultBranch: input.defaultBranch || 'main',
      now: Date.now(),
    });
    return { id };
  }

  static async deleteRepo(id: string, tenantId: string): Promise<void> {
    await CodeRepoRepository.delete(id, tenantId);
  }
}
