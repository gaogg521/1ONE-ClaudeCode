import { describe, expect, it } from 'vitest';

import {
  getSidebarNavItems,
  shouldShowSessionSidebarContent,
} from '@/renderer/components/layout/sidebarNav';

describe('getSidebarNavItems', () => {
  const personalGate = {
    can: (capability: string) =>
      [
        'personal.workspace',
        'issues.personal',
        'personal.agents',
        'skills.local',
        'mcp.personal',
      ].includes(capability),
  };

  const teamGate = {
    can: (capability: string) =>
      [
        'personal.workspace',
        'issues.personal',
        'personal.agents',
        'skills.local',
        'mcp.personal',
        'enterprise.workspace',
        'teams.collaboration',
        'issues.teamPlanning',
        'workspace.agents',
        'skills.org',
        'mcp.org',
        'admin.console',
      ].includes(capability),
  };

  it('shows the issues entry for personal users', () => {
    const items = getSidebarNavItems(personalGate);

    expect(items.some((item) => item.path === '/issues')).toBe(true);
  });

  it('shows the agent assistant entry for personal users', () => {
    const items = getSidebarNavItems(personalGate);

    expect(items.some((item) => item.path === '/super-assistant')).toBe(true);
  });

  it('shows the skills entry for personal users', () => {
    const items = getSidebarNavItems(personalGate);

    expect(items.some((item) => item.path === '/skills')).toBe(true);
  });

  it('hides standalone task board nav when team planning is available (merged into Issues)', () => {
    const items = getSidebarNavItems(teamGate);

    expect(items.some((item) => item.path === '/tasks')).toBe(false);
    const issues = items.find((item) => item.path === '/issues');
    expect(issues?.paths).toContain('/tasks');
  });

  it('keeps standalone task board nav for personal edition', () => {
    const items = getSidebarNavItems(personalGate);

    expect(items.some((item) => item.path === '/tasks')).toBe(true);
  });

  it('hides the enterprise console when admin capability is unavailable', () => {
    const items = getSidebarNavItems(personalGate);

    expect(items.some((item) => item.path === '/enterprise')).toBe(false);
  });
});

describe('shouldShowSessionSidebarContent', () => {
  it('shows chat sidebar actions on conversation routes', () => {
    expect(shouldShowSessionSidebarContent('/conversation/abc')).toBe(true);
    expect(shouldShowSessionSidebarContent('/guid')).toBe(true);
    expect(shouldShowSessionSidebarContent('/team/team-1')).toBe(true);
  });

  it('hides chat sidebar actions on standalone module routes', () => {
    expect(shouldShowSessionSidebarContent('/mcp')).toBe(false);
    expect(shouldShowSessionSidebarContent('/hooks')).toBe(false);
    expect(shouldShowSessionSidebarContent('/issues')).toBe(false);
    expect(shouldShowSessionSidebarContent('/skills')).toBe(false);
    expect(shouldShowSessionSidebarContent('/sessions')).toBe(false);
    expect(shouldShowSessionSidebarContent('/scheduled')).toBe(false);
    expect(shouldShowSessionSidebarContent('/settings/agent')).toBe(false);
  });
});
