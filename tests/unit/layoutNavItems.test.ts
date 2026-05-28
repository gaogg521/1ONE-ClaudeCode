import { describe, expect, it } from 'vitest';

import {
  getSidebarNavItems,
  shouldShowSessionSidebarContent,
} from '@/renderer/components/layout/sidebarNav';

describe('getSidebarNavItems', () => {
  it('shows the enterprise console entry to joined enterprise members', () => {
    const items = getSidebarNavItems(true, false);

    expect(items.some((item) => item.path === '/enterprise')).toBe(true);
  });

  it('shows the super assistant entry to joined enterprise members', () => {
    const items = getSidebarNavItems(true, false);

    expect(items.some((item) => item.path === '/super-assistant')).toBe(true);
  });

  it('keeps the enterprise console hidden before joining an enterprise', () => {
    const items = getSidebarNavItems(false, false);

    expect(items.some((item) => item.path === '/enterprise')).toBe(false);
  });

  it('keeps the super assistant hidden before joining an enterprise', () => {
    const items = getSidebarNavItems(false, false);

    expect(items.some((item) => item.path === '/super-assistant')).toBe(false);
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
    expect(shouldShowSessionSidebarContent('/sessions')).toBe(false);
    expect(shouldShowSessionSidebarContent('/scheduled')).toBe(false);
    expect(shouldShowSessionSidebarContent('/settings/agent')).toBe(false);
  });
});
