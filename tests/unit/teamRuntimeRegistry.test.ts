import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    prepare: vi.fn((sql: string) => ({
      run: (...args: unknown[]) => {
        if (sql.includes('INSERT INTO team_runtime_nodes')) {
          const [
            id,
            tenant_id,
            user_id,
            machine_id,
            display_name,
            hostnames,
            ip_addresses,
            installed_agents,
            last_seen_at,
            updated_at,
          ] = args;
          const existingIndex = rows.findIndex((row) => row.id === id);
          const next = {
            id,
            tenant_id,
            user_id,
            machine_id,
            display_name,
            hostnames,
            ip_addresses,
            installed_agents,
            last_seen_at,
            updated_at,
          };
          if (existingIndex >= 0) {
            rows[existingIndex] = next;
          } else {
            rows.push(next);
          }
        }
      },
      get: (...args: unknown[]) => rows.find((row) => row.id === args[0]),
      all: (...args: unknown[]) => {
        if (sql.includes('team_memberships')) {
          return [{ user_id: 'user-a' }, { user_id: 'user-b' }];
        }
        const tenantId = args[0];
        const scoped = rows.filter((row) => row.tenant_id === tenantId);
        if (sql.includes('user_id IN')) {
          const allowed = new Set(args.slice(1).map(String));
          return scoped.filter((row) => allowed.has(String(row.user_id)));
        }
        return scoped;
      },
    })),
  };
});

vi.mock('@process/services/database', () => ({
  getDatabase: async () => ({
    getDriver: () => mockDb,
  }),
}));

vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    getDetectedAgents: () => [{ backend: 'claude', name: 'Claude', cliPath: '/bin/claude' }],
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async () => []),
    set: vi.fn(async () => undefined),
  },
}));

import { TeamRuntimeRegistry } from '@process/team/TeamRuntimeRegistry';

describe('TeamRuntimeRegistry', () => {
  beforeEach(() => {
    mockDb.rows.length = 0;
  });

  it('upserts and lists runtime nodes for a tenant', async () => {
    const registry = new TeamRuntimeRegistry();
    const node = await registry.upsertNode({
      tenantId: 'tenant-1',
      userId: 'user-a',
      machineId: 'machine-a',
      displayName: 'LT00278-ZG',
      hostnames: ['LT00278-ZG'],
      ipAddresses: ['192.168.1.10'],
      installedAgents: [{ backend: 'claude', name: 'Claude' }],
    });
    expect(node.displayName).toBe('LT00278-ZG');
    const listed = await registry.listNodes({ tenantId: 'tenant-1', includeOffline: true });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.installedAgents[0]?.backend).toBe('claude');
  });

  it('filters nodes by team membership user ids', async () => {
    const registry = new TeamRuntimeRegistry();
    await registry.upsertNode({
      tenantId: 'tenant-1',
      userId: 'user-a',
      machineId: 'machine-a',
      displayName: 'A',
      hostnames: ['A'],
      ipAddresses: [],
      installedAgents: [],
    });
    await registry.upsertNode({
      tenantId: 'tenant-1',
      userId: 'user-c',
      machineId: 'machine-c',
      displayName: 'C',
      hostnames: ['C'],
      ipAddresses: [],
      installedAgents: [],
    });
    const listed = await registry.listNodes({
      tenantId: 'tenant-1',
      teamIds: ['team-1'],
      includeOffline: true,
    });
    expect(listed.map((node) => node.userId)).toEqual(['user-a']);
  });
});
