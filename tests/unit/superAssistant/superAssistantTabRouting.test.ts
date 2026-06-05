import { describe, expect, it } from 'vitest';
import {
  AGENT_FLEET_PATH,
  buildSuperAssistantPath,
  parseSuperAssistantTab,
  readSuperAssistantSearch,
  shouldRedirectLegacyRuntimesTab,
} from '@/renderer/pages/superAssistant/superAssistantTabRouting';

describe('superAssistantTabRouting', () => {
  it('maps legacy workspace tab to overview', () => {
    expect(parseSuperAssistantTab('?tab=workspace')).toBe('overview');
  });

  it('maps legacy runtimes tab to overview and flags redirect', () => {
    expect(parseSuperAssistantTab('?tab=runtimes')).toBe('overview');
    expect(shouldRedirectLegacyRuntimesTab('?tab=runtimes')).toBe(true);
    expect(shouldRedirectLegacyRuntimesTab('?tab=agents')).toBe(false);
  });

  it('exports agent fleet path for sidebar navigation', () => {
    expect(AGENT_FLEET_PATH).toBe('/agent-fleet');
  });

  it('builds super assistant paths with issue context', () => {
    expect(
      buildSuperAssistantPath({
        tab: 'agents',
        issueId: 'issue-1',
      })
    ).toBe('/super-assistant?tab=agents&issueId=issue-1');
  });

  it('falls back to hash query when router search is empty', () => {
    if (typeof window === 'undefined') {
      return;
    }
    const previousHash = window.location.hash;
    window.location.hash = '#/super-assistant?tab=skills';
    expect(
      readSuperAssistantSearch({
        search: '',
      })
    ).toBe('?tab=skills');
    window.location.hash = previousHash;
  });
});
