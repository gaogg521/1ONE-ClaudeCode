import { describe, expect, it } from 'vitest';

import { getSidebarNavItems } from '@/renderer/components/layout/Layout';

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
