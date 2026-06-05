import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TeamRuntimeFleetPanel from '@/renderer/pages/superAssistant/components/TeamRuntimeFleetPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; [key: string]: unknown }) => {
      const template = options?.defaultValue;
      if (!template) return _key;
      return Object.entries(options ?? {}).reduce((result, [key, value]) => {
        if (key === 'defaultValue') return result;
        return result.replaceAll(`{{${key}}}`, String(value ?? ''));
      }, template);
    },
  }),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/renderer/pages/superAssistant/hooks/useTeamRuntimeFleet', () => ({
  useTeamRuntimeFleet: () => ({
    nodes: [],
    stats: { total: 0, online: 0, offline: 0 },
    loading: false,
    refresh: vi.fn(),
  }),
}));

describe('TeamRuntimeFleetPanel', () => {
  it('renders fleet stats badges without ReferenceError when nodes are provided', () => {
    render(
      <TeamRuntimeFleetPanel
        enabled={false}
        nodesOverride={[
          {
            id: 'node-1',
            tenantId: 'tenant-a',
            userId: 'user-2',
            displayName: 'teammate-pc',
            hostnames: ['pc-2'],
            ipAddresses: ['10.0.0.2'],
            installedAgents: [{ name: 'Claude', backend: 'claude', cliPath: '/usr/bin/claude' }],
            status: 'online',
            lastSeenAt: Date.now(),
          },
        ]}
      />
    );

    expect(screen.getByText('全部')).toBeInTheDocument();
    expect(screen.getByText(/在线 1/)).toBeInTheDocument();
    expect(screen.getByText(/离线 0/)).toBeInTheDocument();
    expect(screen.getAllByText('teammate-pc').length).toBeGreaterThan(0);
  });
});
