/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICssTheme } from '@/common/config/storage.ts';
import { cyberCover, volcanicCover, forestCover, auroraCover, moonlightCover } from './themeCovers.ts';

// 1ONE ClaudeCode 5套专属主题 CSS（raw string）
import cyberCss from './presets/1one-cyber.css?raw';
import volcanicCss from './presets/1one-volcanic.css?raw';
import forestCss from './presets/1one-forest.css?raw';
import auroraCss from './presets/1one-aurora.css?raw';
import moonlightCss from './presets/1one-moonlight.css?raw';

/**
 * 默认主题 ID
 */
export const DEFAULT_THEME_ID = '1one-cyber-theme';

/**
 * 1ONE ClaudeCode 5套专属预设主题
 */
export const PRESET_THEMES: ICssTheme[] = [
  {
    id: '1one-cyber-theme',
    name: '赛博蓝',
    isPreset: true,
    cover: cyberCover,
    css: cyberCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '1one-volcanic-theme',
    name: '熔岩橙',
    isPreset: true,
    cover: volcanicCover,
    css: volcanicCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '1one-forest-theme',
    name: '深林绿',
    isPreset: true,
    cover: forestCover,
    css: forestCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '1one-aurora-theme',
    name: '极光紫',
    isPreset: true,
    cover: auroraCover,
    css: auroraCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: '1one-moonlight-theme',
    name: '月光银',
    isPreset: true,
    cover: moonlightCover,
    css: moonlightCss,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];
