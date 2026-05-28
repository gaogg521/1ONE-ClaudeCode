import { describe, expect, it } from 'vitest';
import { resolveSettingsTabAnchor } from '@/renderer/pages/settings/components/SettingsSider';

describe('resolveSettingsTabAnchor', () => {
  it('remaps removed display anchor to tools', () => {
    expect(resolveSettingsTabAnchor('display')).toBe('tools');
  });

  it('keeps other anchors unchanged', () => {
    expect(resolveSettingsTabAnchor('system')).toBe('system');
  });
});
