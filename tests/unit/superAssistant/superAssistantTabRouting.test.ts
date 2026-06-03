import { describe, expect, it } from 'vitest';
import {
  buildSuperAssistantPath,
  parseSuperAssistantTab,
  readSuperAssistantSearch,
} from '@/renderer/pages/superAssistant/superAssistantTabRouting';

describe('superAssistantTabRouting', () => {
  it('maps legacy workspace tab to overview', () => {
    expect(parseSuperAssistantTab('?tab=workspace')).toBe('overview');
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
