import { describe, expect, it } from 'vitest';
import {
  ADMIN_TEAM_RUNTIME_NODES_PATH,
  TEAM_RUNTIME_HEARTBEAT_PATH,
  TEAM_RUNTIME_NODES_PATH,
} from '@/common/teamRuntime/syncChannels';
import { mergeTeamRuntimeNodes } from '@/renderer/utils/teamRuntimeOrgSync';

describe('team runtime admin sync contract', () => {
  it('exposes shared API paths for C/S and B/S', () => {
    expect(TEAM_RUNTIME_HEARTBEAT_PATH).toBe('/api/team-runtime/heartbeat');
    expect(TEAM_RUNTIME_NODES_PATH).toBe('/api/team-runtime/nodes');
    expect(ADMIN_TEAM_RUNTIME_NODES_PATH).toBe('/api/admin/team-runtime/nodes');
  });

  it('merges fleet nodes from admin backend', () => {
    const merged = mergeTeamRuntimeNodes(
      [
        {
          id: 'local',
          tenantId: 't1',
          userId: 'u1',
          machineId: 'm1',
          displayName: 'A',
          hostnames: [],
          ipAddresses: [],
          installedAgents: [],
          status: 'online',
          lastSeenAt: 1,
          updatedAt: 1,
        },
      ],
      [
        {
          id: 'remote',
          tenantId: 't1',
          userId: 'u2',
          machineId: 'm2',
          displayName: 'B',
          hostnames: [],
          ipAddresses: [],
          installedAgents: [],
          status: 'online',
          lastSeenAt: 2,
          updatedAt: 2,
        },
      ]
    );
    expect(merged).toHaveLength(2);
  });
});
