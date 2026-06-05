import { describe, expect, it } from 'vitest';

import {
  getSidebarNavItems,
  isNavItemActive,
  shouldShowSessionSidebarContent,
  type NavItem,
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

  it('shows org nodes nav only when enterprise workspace is available', () => {
    expect(getSidebarNavItems(personalGate).some((item) => item.path === '/agent-fleet')).toBe(
      false
    );
    expect(getSidebarNavItems(teamGate).some((item) => item.path === '/agent-fleet')).toBe(true);
  });
});

const skillsNavItem: NavItem = {
  icon: null,
  labelKey: 'nav.skills',
  labelDefault: 'Skills',
  path: '/skills',
  paths: ['/enterprise/skills'],
};

const settingsNavItem: NavItem = {
  icon: null,
  labelKey: 'nav.globalSettings',
  labelDefault: 'Settings',
  path: '/settings',
};

describe('isNavItemActive', () => {
  it('highlights settings but not skills on skills-hub settings tab', () => {
    expect(isNavItemActive('/settings/skills-hub', settingsNavItem)).toBe(true);
    expect(isNavItemActive('/settings/skills-hub', skillsNavItem)).toBe(false);
  });

  it('highlights skills on the skills module route', () => {
    expect(isNavItemActive('/skills', skillsNavItem)).toBe(true);
    expect(isNavItemActive('/skills/my-skill', skillsNavItem)).toBe(true);
    expect(isNavItemActive('/settings/skills-hub', skillsNavItem)).toBe(false);
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
    expect(shouldShowSessionSidebarContent('/agent-fleet')).toBe(false);
    expect(shouldShowSessionSidebarContent('/settings/agent')).toBe(false);
  });
});
