import { describe, expect, it } from 'vitest';
import {
  findOneThemePresetById,
  resolvePresetForLightDarkToggle,
} from '@/renderer/utils/theme/applyOneThemePreset';

describe('applyOneThemePreset', () => {
  it('maps cyber dark to moonlight when toggling to light', () => {
    const cyber = findOneThemePresetById('cyber-blue');
    const next = resolvePresetForLightDarkToggle(cyber, 'light');
    expect(next.id).toBe('moonlight');
    expect(next.theme).toBe('light');
  });

  it('maps moonlight to cyber when toggling to dark without a dark moonlight preset', () => {
    const moon = findOneThemePresetById('moonlight');
    const next = resolvePresetForLightDarkToggle(moon, 'dark');
    expect(next.id).toBe('cyber-blue');
    expect(next.theme).toBe('dark');
  });
});
