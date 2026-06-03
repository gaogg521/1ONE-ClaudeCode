/**
 * Apply 1ONE sidebar color presets (data-color-scheme + light/dark + body background).
 */

import type { ColorScheme } from '@renderer/hooks/ui/useColorScheme';
import type { Theme } from '@renderer/hooks/system/useTheme';

export type OneThemePreset = {
  id: string;
  colorScheme: ColorScheme;
  theme: Theme;
  bodyBg: string;
};

export const ONE_THEME_PRESETS: OneThemePreset[] = [
  {
    id: 'default-dark',
    colorScheme: 'default',
    theme: 'dark',
    bodyBg: '#0e0e0e',
  },
  {
    id: 'cyber-blue',
    colorScheme: '1one-cyber',
    theme: 'dark',
    bodyBg:
      'radial-gradient(circle at 10% 6%, rgba(34,211,238,0.18) 0, transparent 36%), radial-gradient(circle at 88% 10%, rgba(96,165,250,0.14) 0, transparent 40%), #050f22',
  },
  {
    id: 'volcanic',
    colorScheme: '1one-volcanic',
    theme: 'dark',
    bodyBg:
      'radial-gradient(circle at 15% 8%, rgba(251,146,60,0.20) 0, transparent 35%), radial-gradient(circle at 85% 15%, rgba(245,158,11,0.16) 0, transparent 42%), #130b05',
  },
  {
    id: 'deep-forest',
    colorScheme: '1one-forest',
    theme: 'dark',
    bodyBg:
      'radial-gradient(circle at 8% 8%, rgba(52,211,153,0.18) 0, transparent 38%), radial-gradient(circle at 88% 12%, rgba(34,197,94,0.13) 0, transparent 44%), #061710',
  },
  {
    id: 'aurora',
    colorScheme: '1one-aurora',
    theme: 'dark',
    bodyBg:
      'radial-gradient(ellipse at 10% 5%, rgba(167,139,250,0.26) 0, transparent 40%), radial-gradient(ellipse at 90% 8%, rgba(232,121,249,0.16) 0, transparent 45%), #070515',
  },
  {
    id: 'moonlight',
    colorScheme: '1one-moonlight',
    theme: 'light',
    bodyBg: '#f0f4fb',
  },
];

const STORAGE_THEME_ID = '1one-theme';

export function findOneThemePresetById(id: string): OneThemePreset {
  return ONE_THEME_PRESETS.find((item) => item.id === id) ?? ONE_THEME_PRESETS[0];
}

export function resolvePresetForLightDarkToggle(current: OneThemePreset, nextTheme: Theme): OneThemePreset {
  const sameScheme = ONE_THEME_PRESETS.find(
    (item) => item.colorScheme === current.colorScheme && item.theme === nextTheme
  );
  if (sameScheme) {
    return sameScheme;
  }
  if (nextTheme === 'light') {
    return ONE_THEME_PRESETS.find((item) => item.id === 'moonlight') ?? ONE_THEME_PRESETS[0];
  }
  return ONE_THEME_PRESETS.find((item) => item.id === 'cyber-blue') ?? ONE_THEME_PRESETS[1];
}

/** Keep DOM attributes, Arco theme, and local caches aligned. */
export function applyOneThemePreset(preset: OneThemePreset): void {
  document.documentElement.setAttribute('data-color-scheme', preset.colorScheme);
  document.documentElement.setAttribute('data-theme', preset.theme);
  document.body.setAttribute('arco-theme', preset.theme);
  document.body.style.background = preset.bodyBg;
  try {
    localStorage.setItem(STORAGE_THEME_ID, preset.id);
    localStorage.setItem('__1one_theme', preset.theme);
    localStorage.setItem('__1one_colorScheme', preset.colorScheme);
  } catch {
    // ignore quota errors
  }
}

export function readStoredOneThemePresetId(): string | null {
  try {
    return localStorage.getItem(STORAGE_THEME_ID);
  } catch {
    return null;
  }
}
