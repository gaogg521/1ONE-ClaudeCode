// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addPinnedProject,
  readPinnedProjects,
  removePinnedProject,
  getProjectDisplayName,
} from '@/renderer/utils/workspace/pinnedProjects';

describe('pinnedProjects', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores and reads pinned project paths', () => {
    expect(readPinnedProjects()).toEqual([]);
    const next = addPinnedProject('/repo/alpha');
    expect(next).toEqual(['/repo/alpha']);
    expect(readPinnedProjects()).toEqual(['/repo/alpha']);
  });

  it('deduplicates paths and trims trailing separators', () => {
    addPinnedProject('/repo/alpha/');
    const next = addPinnedProject('/repo/alpha');
    expect(next).toEqual(['/repo/alpha']);
  });

  it('removes pinned project paths', () => {
    addPinnedProject('/repo/alpha');
    addPinnedProject('/repo/beta');
    const next = removePinnedProject('/repo/alpha');
    expect(next).toEqual(['/repo/beta']);
    expect(readPinnedProjects()).toEqual(['/repo/beta']);
  });

  it('derives display name from path', () => {
    expect(getProjectDisplayName('/Users/me/projects/demo/')).toBe('demo');
    expect(getProjectDisplayName('D:\\work\\repo')).toBe('repo');
  });
});
