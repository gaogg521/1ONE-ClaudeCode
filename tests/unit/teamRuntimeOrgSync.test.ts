import { describe, expect, it } from 'vitest';
import type { TeamRuntimeNode } from '@/common/types/teamRuntimeTypes';
import { mergeTeamRuntimeNodes } from '@/renderer/utils/teamRuntimeOrgSync';

function node(partial: Partial<TeamRuntimeNode> & Pick<TeamRuntimeNode, 'id'>): TeamRuntimeNode {
  return {
    tenantId: 'tenant-a',
    userId: 'user-a',
    machineId: 'machine-a',
    displayName: 'host-a',
    hostnames: ['host-a'],
    ipAddresses: ['10.0.0.1'],
    installedAgents: [{ backend: 'claude', name: 'Claude' }],
    status: 'online',
    lastSeenAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe('mergeTeamRuntimeNodes', () => {
  it('prefers the newest heartbeat when ids collide', () => {
    const local = [node({ id: 't:u:m', lastSeenAt: 100, ipAddresses: ['10.0.0.1'] })];
    const remote = [node({ id: 't:u:m', lastSeenAt: 200, ipAddresses: ['10.0.0.2'] })];
    const merged = mergeTeamRuntimeNodes(local, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.ipAddresses).toEqual(['10.0.0.2']);
  });

  it('keeps distinct machines from teammates', () => {
    const merged = mergeTeamRuntimeNodes(
      [node({ id: 'a', userId: 'user-a' })],
      [node({ id: 'b', userId: 'user-b', displayName: 'mac-b' })]
    );
    expect(merged.map((item) => item.id).toSorted()).toEqual(['a', 'b']);
  });
});
