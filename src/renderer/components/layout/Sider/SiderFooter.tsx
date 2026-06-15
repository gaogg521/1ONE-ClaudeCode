/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { IconMoonFill, IconSunFill } from '@arco-design/web-react/icon';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import type { Theme } from '@renderer/hooks/system/useTheme';
import {
  applyOneThemePreset,
  findOneThemePresetById,
  readStoredOneThemePresetId,
  resolvePresetForLightDarkToggle,
  type OneThemePreset,
} from '@renderer/utils/theme/applyOneThemePreset';
import WorkspaceIdentityPanel from '../WorkspaceIdentityPanel';

interface SiderFooterProps {
  isMobile: boolean;
  collapsed: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onThemeToggle: () => void;
  onThemePresetApplied?: (preset: OneThemePreset) => void;
}

type ThemeSwatch = OneThemePreset & {
  label: string;
  gradient: string;
};

const THEME_SWATCHES: ThemeSwatch[] = [
  {
    ...findOneThemePresetById('default-dark'),
    label: '暗夜默认',
    gradient: 'linear-gradient(135deg, #2a2a2a 0%, #4d9fff 50%, #1a1a1a 100%)',
  },
  {
    ...findOneThemePresetById('cyber-blue'),
    label: '赛博蓝',
    gradient: 'radial-gradient(circle at 30% 30%, #22d3ee 0%, #0b1d3a 55%, #061126 100%)',
  },
  {
    ...findOneThemePresetById('volcanic'),
    label: '熔岩橙',
    gradient: 'radial-gradient(circle at 30% 30%, #fb923c 0%, #2a1810 55%, #140c06 100%)',
  },
  {
    ...findOneThemePresetById('deep-forest'),
    label: '深林绿',
    gradient: 'radial-gradient(circle at 30% 30%, #34d399 0%, #112c22 55%, #071a10 100%)',
  },
  {
    ...findOneThemePresetById('aurora'),
    label: '极光紫',
    gradient: 'radial-gradient(circle at 30% 30%, #a78bfa 0%, #160f30 45%, #e879f9 80%, #080616 100%)',
  },
  {
    ...findOneThemePresetById('moonlight'),
    label: '月光银',
    gradient: 'linear-gradient(135deg, #f3f6fb 0%, #bbc7e0 40%, #0369a1 100%)',
  },
];

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  collapsed,
  theme,
  siderTooltipProps,
  onThemeToggle,
  onThemePresetApplied,
}) => {
  const { t } = useTranslation();

  const [currentTheme, setCurrentTheme] = useState<ThemeSwatch>(() => {
    const saved = readStoredOneThemePresetId();
    const preset = findOneThemePresetById(saved ?? 'cyber-blue');
    return THEME_SWATCHES.find((item) => item.id === preset.id) ?? THEME_SWATCHES[1];
  });

  const applySwatch = useCallback(
    (swatch: ThemeSwatch, options?: { notifyParent?: boolean }) => {
      applyOneThemePreset(swatch);
      setCurrentTheme(swatch);
      if (options?.notifyParent !== false) {
        onThemePresetApplied?.(swatch);
      }
    },
    [onThemePresetApplied]
  );

  const handleSelectTheme = useCallback(
    (swatch: ThemeSwatch) => {
      applySwatch(swatch);
      if (swatch.theme === 'light' && theme === 'dark') {
        onThemeToggle();
      } else if (swatch.theme === 'dark' && theme === 'light') {
        onThemeToggle();
      }
    },
    [applySwatch, onThemeToggle, theme]
  );

  useEffect(() => {
    applySwatch(currentTheme, { notifyParent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLightDarkClick = useCallback(() => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    const nextPreset = resolvePresetForLightDarkToggle(currentTheme, nextTheme);
    const swatch = THEME_SWATCHES.find((item) => item.id === nextPreset.id) ?? THEME_SWATCHES[1];
    applySwatch(swatch);
    onThemeToggle();
  }, [applySwatch, currentTheme, onThemeToggle, theme]);

  return (
    <div className='shrink-0 sider-footer pt-8px overflow-hidden'>
      <div className='flex flex-col gap-2px'>
        <div className={classNames('pb-6px', collapsed ? 'flex justify-center px-0' : 'px-4px')}>
          <WorkspaceIdentityPanel compact={collapsed} surface={collapsed ? 'pill' : 'card'} />
        </div>

        <div
          className={classNames(
            'flex items-center justify-between px-12px py-6px rd-0.5rem',
            isMobile && 'sider-footer-btn-mobile'
          )}
        >
          <Tooltip
            {...siderTooltipProps}
            content={theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
            position='right'
          >
            <div
              onClick={handleLightDarkClick}
              className='flex items-center gap-6px cursor-pointer hover:opacity-80 transition-opacity'
              aria-label={theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
            >
              {theme === 'dark' ? (
                <IconSunFill style={{ fontSize: 16, color: 'rgb(var(--primary-6))' }} />
              ) : (
                <IconMoonFill style={{ fontSize: 16, color: 'rgb(var(--primary-6))' }} />
              )}
              <span className='collapsed-hidden text-12px text-t-secondary'>
                {theme === 'dark' ? t('settings.darkMode') : t('settings.lightMode')}
              </span>
            </div>
          </Tooltip>

          {!collapsed ? (
            <div className='collapsed-hidden flex items-center gap-4px'>
              {THEME_SWATCHES.map((th) => (
                <Tooltip key={th.id} content={th.label} position='top' mini>
                  <div
                    onClick={() => handleSelectTheme(th)}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: th.gradient,
                      cursor: 'pointer',
                      border:
                        currentTheme.id === th.id
                          ? `2px solid ${th.theme === 'light' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)'}`
                          : `2px solid rgba(128,128,128,0.2)`,
                      boxShadow:
                        currentTheme.id === th.id
                          ? `0 0 0 1px rgba(255,255,255,0.2), 0 0 6px rgba(255,255,255,0.2)`
                          : 'none',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = 'scale(1.25)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                    }}
                  />
                </Tooltip>
              ))}
            </div>
          ) : (
            <Tooltip content={currentTheme.label} position='right' mini>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: currentTheme.gradient,
                  border:
                    currentTheme.theme === 'light' ? '2px solid rgba(0,0,0,0.6)' : '2px solid rgba(255,255,255,0.9)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.2), 0 0 6px rgba(255,255,255,0.2)',
                  flexShrink: 0,
                }}
              />
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};

export default SiderFooter;
