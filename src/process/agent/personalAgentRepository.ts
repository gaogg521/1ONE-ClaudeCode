/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import type {
  CreatePersonalAgentInput,
  PersonalAgent,
  UpdatePersonalAgentInput,
} from '@/common/types/personalAgentTypes';
import { getDatabase } from '@process/services/database';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';

type PersonalAgentRow = {
  id: string;
  owner_user_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  agent_type: string;
  conversation_type: string;
  custom_agent_id: string | null;
  cli_path: string | null;
  automation_config: string;
  created_at: number;
  updated_at: number;
};

function parseAutomationConfig(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function rowToPersonalAgent(row: PersonalAgentRow): PersonalAgent {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    agentType: row.agent_type,
    conversationType: row.conversation_type,
    customAgentId: row.custom_agent_id ?? undefined,
    cliPath: row.cli_path ?? undefined,
    automationConfig: parseAutomationConfig(row.automation_config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqlitePersonalAgentRepository {
  private readonly driver?: ISqliteDriver;

  constructor(driver?: ISqliteDriver) {
    this.driver = driver;
  }

  private async getDb(): Promise<ISqliteDriver> {
    if (this.driver) return this.driver;
    const database = await getDatabase();
    return database.getDriver();
  }

  async create(input: PersonalAgent | CreatePersonalAgentInput): Promise<PersonalAgent> {
    const now = Date.now();
    const agent: PersonalAgent = {
      id: input.id ?? randomUUID(),
      ownerUserId: input.ownerUserId,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      agentType: input.agentType,
      conversationType: input.conversationType,
      customAgentId: input.customAgentId,
      cliPath: input.cliPath,
      automationConfig: input.automationConfig ?? {},
      createdAt: 'createdAt' in input ? input.createdAt : now,
      updatedAt: 'updatedAt' in input ? input.updatedAt : now,
    };

    const db = await this.getDb();
    db.prepare(
      `INSERT INTO personal_agents (
        id, owner_user_id, tenant_id, name, description, agent_type,
        conversation_type, custom_agent_id, cli_path, automation_config,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      agent.id,
      agent.ownerUserId,
      agent.tenantId,
      agent.name,
      agent.description ?? null,
      agent.agentType,
      agent.conversationType,
      agent.customAgentId ?? null,
      agent.cliPath ?? null,
      JSON.stringify(agent.automationConfig),
      agent.createdAt,
      agent.updatedAt
    );
    return agent;
  }

  async findById(id: string, ownerUserId?: string): Promise<PersonalAgent | null> {
    const db = await this.getDb();
    const row = ownerUserId
      ? (db.prepare('SELECT * FROM personal_agents WHERE id = ? AND owner_user_id = ?').get(id, ownerUserId) as
          | PersonalAgentRow
          | undefined)
      : (db.prepare('SELECT * FROM personal_agents WHERE id = ?').get(id) as PersonalAgentRow | undefined);
    return row ? rowToPersonalAgent(row) : null;
  }

  async findAllByOwner(ownerUserId: string): Promise<PersonalAgent[]> {
    const db = await this.getDb();
    const rows = db
      .prepare('SELECT * FROM personal_agents WHERE owner_user_id = ? ORDER BY updated_at DESC')
      .all(ownerUserId) as PersonalAgentRow[];
    return rows.map(rowToPersonalAgent);
  }

  async update(id: string, updates: UpdatePersonalAgentInput, ownerUserId?: string): Promise<PersonalAgent> {
    const current = await this.findById(id, ownerUserId);
    if (!current) {
      throw new Error(`Personal agent "${id}" not found`);
    }
    const next: PersonalAgent = {
      ...current,
      ...updates,
      updatedAt: updates.updatedAt ?? Date.now(),
    };
    const db = await this.getDb();
    db.prepare(
      `UPDATE personal_agents
       SET name = ?, description = ?, agent_type = ?, conversation_type = ?,
           custom_agent_id = ?, cli_path = ?, automation_config = ?, updated_at = ?
       WHERE id = ? AND owner_user_id = ?`
    ).run(
      next.name,
      next.description ?? null,
      next.agentType,
      next.conversationType,
      next.customAgentId ?? null,
      next.cliPath ?? null,
      JSON.stringify(next.automationConfig),
      next.updatedAt,
      id,
      current.ownerUserId
    );
    return next;
  }

  async delete(id: string, ownerUserId?: string): Promise<void> {
    const db = await this.getDb();
    if (ownerUserId) {
      db.prepare('DELETE FROM personal_agents WHERE id = ? AND owner_user_id = ?').run(id, ownerUserId);
      return;
    }
    db.prepare('DELETE FROM personal_agents WHERE id = ?').run(id);
  }
}
