/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import os from 'os';
import { acpDetector } from '@process/agent/acp/AcpDetector';
import { getDatabase } from '@process/services/database';
import type {
  ListTeamRuntimeNodesInput,
  TeamRuntimeInstalledAgent,
  TeamRuntimeNode,
  TeamRuntimeNodeStatus,
  UpsertTeamRuntimeNodeInput,
} from '@/common/types/teamRuntimeTypes';
import { ProcessConfig } from '@process/utils/initStorage';

const OFFLINE_AFTER_MS = 3 * 60 * 1000;
const MACHINE_ID_CONFIG_KEY = 'teamRuntime.machineId';

type TeamRuntimeRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  machine_id: string;
  display_name: string;
  hostnames: string;
  ip_addresses: string;
  installed_agents: string;
  last_seen_at: number;
  updated_at: number;
};

function parseJsonArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function rowToNode(row: TeamRuntimeRow, now: number): TeamRuntimeNode {
  const status: TeamRuntimeNodeStatus =
    now - row.last_seen_at <= OFFLINE_AFTER_MS ? 'online' : 'offline';
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    machineId: row.machine_id,
    displayName: row.display_name,
    hostnames: parseJsonArray<string>(row.hostnames, []),
    ipAddresses: parseJsonArray<string>(row.ip_addresses, []),
    installedAgents: parseJsonArray<TeamRuntimeInstalledAgent>(row.installed_agents, []),
    status,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  };
}

function collectIpv4Addresses(): string[] {
  const addresses = new Set<string>();
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) {
      continue;
    }
    for (const entry of entries) {
      if (!entry || entry.internal) {
        continue;
      }
      const family = String(entry.family);
      if (family !== 'IPv4' && family !== '4') {
        continue;
      }
      if (entry.address) {
        addresses.add(entry.address);
      }
    }
  }
  return [...addresses];
}

async function resolveStableMachineId(): Promise<string> {
  const existing = await ProcessConfig.get(MACHINE_ID_CONFIG_KEY).catch(() => undefined);
  if (typeof existing === 'string' && existing.trim().length > 0) {
    return existing.trim();
  }
  const machineId = `${os.hostname()}-${process.platform}-${Date.now().toString(36)}`;
  await ProcessConfig.set(MACHINE_ID_CONFIG_KEY, machineId).catch(() => undefined);
  return machineId;
}

async function detectInstalledAgents(): Promise<TeamRuntimeInstalledAgent[]> {
  const disabledDetectedAgents =
    ((await ProcessConfig.get('acp.disabledDetectedAgents').catch(() => [])) as string[]) || [];
  const agents = acpDetector
    .getDetectedAgents()
    .filter((agent) => !disabledDetectedAgents.includes(agent.backend))
    .map(
      (agent): TeamRuntimeInstalledAgent => ({
        backend: agent.backend,
        name: agent.name,
        cliPath: agent.cliPath,
      })
    );
  return agents;
}

export class TeamRuntimeRegistry {
  upsertNode(input: UpsertTeamRuntimeNodeInput): TeamRuntimeNode {
    const db = getDatabase().getDb();
    const now = Date.now();
    const id = `${input.tenantId}:${input.userId}:${input.machineId}`;
    db.prepare(
      `INSERT INTO team_runtime_nodes (
        id, tenant_id, user_id, machine_id, display_name, hostnames, ip_addresses,
        installed_agents, last_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        hostnames = excluded.hostnames,
        ip_addresses = excluded.ip_addresses,
        installed_agents = excluded.installed_agents,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at`
    ).run(
      id,
      input.tenantId,
      input.userId,
      input.machineId,
      input.displayName,
      JSON.stringify(input.hostnames),
      JSON.stringify(input.ipAddresses),
      JSON.stringify(input.installedAgents),
      now,
      now
    );
    const row = db
      .prepare('SELECT * FROM team_runtime_nodes WHERE id = ?')
      .get(id) as TeamRuntimeRow;
    return rowToNode(row, now);
  }

  async publishLocalNode(params: { tenantId: string; userId: string }): Promise<TeamRuntimeNode> {
    const machineId = await resolveStableMachineId();
    const hostname = os.hostname();
    return this.upsertNode({
      tenantId: params.tenantId,
      userId: params.userId,
      machineId,
      displayName: hostname,
      hostnames: [hostname],
      ipAddresses: collectIpv4Addresses(),
      installedAgents: await detectInstalledAgents(),
    });
  }

  listNodes(input: ListTeamRuntimeNodesInput): TeamRuntimeNode[] {
    const db = getDatabase().getDb();
    const now = Date.now();
    let userFilter: string[] | null = null;

    if (input.teamIds && input.teamIds.length > 0) {
      const placeholders = input.teamIds.map(() => '?').join(', ');
      const rows = db
        .prepare(
          `SELECT DISTINCT user_id FROM team_memberships
           WHERE tenant_id = ? AND team_id IN (${placeholders})`
        )
        .all(input.tenantId, ...input.teamIds) as Array<{ user_id: string }>;
      userFilter = rows.map((row) => row.user_id);
      if (userFilter.length === 0) {
        return [];
      }
    }

    const rows = userFilter
      ? (db
          .prepare(
            `SELECT * FROM team_runtime_nodes
             WHERE tenant_id = ? AND user_id IN (${userFilter.map(() => '?').join(', ')})
             ORDER BY last_seen_at DESC`
          )
          .all(input.tenantId, ...userFilter) as TeamRuntimeRow[])
      : (db
          .prepare(
            `SELECT * FROM team_runtime_nodes
             WHERE tenant_id = ?
             ORDER BY last_seen_at DESC`
          )
          .all(input.tenantId) as TeamRuntimeRow[]);

    const nodes = rows.map((row) => rowToNode(row, now));
    if (input.includeOffline) {
      return nodes;
    }
    return nodes.filter((node) => node.status === 'online');
  }
}

let registrySingleton: TeamRuntimeRegistry | null = null;

export function getTeamRuntimeRegistry(): TeamRuntimeRegistry {
  if (!registrySingleton) {
    registrySingleton = new TeamRuntimeRegistry();
  }
  return registrySingleton;
}
