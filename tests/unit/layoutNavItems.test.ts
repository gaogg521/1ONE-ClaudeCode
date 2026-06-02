import { describe, expect, it } from 'vitest';

import {
  getSidebarNavItems,
  shouldShowSessionSidebarContent,
} from '@/renderer/components/layout/sidebarNav';

describe('getSidebarNavItems', () => {
  it('shows the issues entry to joined enterprise members', () => {
    const items = getSidebarNavItems(true, false);

    expect(items.some((item) => item.path === '/issues')).toBe(true);
  });

  it('shows the agent assistant entry to joined enterprise members', () => {
    const items = getSidebarNavItems(true, false);

    expect(items.some((item) => item.path === '/super-assistant')).toBe(true);
  });

  it('shows the skills entry to joined enterprise members', () => {
    const items = getSidebarNavItems(true, false);

    expect(items.some((item) => item.path === '/skills')).toBe(true);
  });

  it('hides standalone task board nav when enterprise is joined (merged into Issues)', () => {
    const items = getSidebarNavItems(true, false);

    expect(items.some((item) => item.path === '/tasks')).toBe(false);
    const issues = items.find((item) => item.path === '/issues');
    expect(issues?.paths).toContain('/tasks');
  });

  it('keeps standalone task board nav for personal edition', () => {
    const items = getSidebarNavItems(false, false);

    expect(items.some((item) => item.path === '/tasks')).toBe(true);
  });

  it('keeps the issues entry hidden before joining an enterprise', () => {
    const items = getSidebarNavItems(false, false);

    expect(items.some((item) => item.path === '/issues')).toBe(false);
  });

  it('keeps the super assistant hidden before joining an enterprise', () => {
    const items = getSidebarNavItems(false, false);

    expect(items.some((item) => item.path === '/super-assistant')).toBe(false);
  });

  it('keeps the skills entry hidden before joining an enterprise', () => {
    const items = getSidebarNavItems(false, false);

    expect(items.some((item) => item.path === '/skills')).toBe(false);
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
