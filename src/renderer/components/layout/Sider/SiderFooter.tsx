/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { IconMoonFill, IconSunFill } from '@arco-design/web-react/icon';
import { ArrowCircleLeft, SettingTwo } from '@icon-park/react';
import classNames from 'classnames';
import { iconColors } from '@renderer/styles/colors';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { ConfigStorage } from '@/common/config/storage';

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  onThemeToggle: () => void;
}

interface ThemeItem {
  id: string;
  colorScheme: string;
  theme: string;
  label: string;
  gradient: string;
  bodyBg: string;
}

const THEMES: ThemeItem[] = [
  {
    id: 'default-dark',
    colorScheme: 'default',
    theme: 'dark',
    label: '暗夜默认',
    gradient: 'linear-gradient(135deg, #2a2a2a 0%, #4d9fff 50%, #1a1a1a 100%)',
    bodyBg: '#0e0e0e',
  },
  {
    id: 'cyber-blue',
    colorScheme: '1one-cyber',
    theme: 'dark',
    label: '赛博蓝',
    gradient: 'radial-gradient(circle at 30% 30%, #22d3ee 0%, #0b1d3a 55%, #061126 100%)',
    bodyBg: `radial-gradient(circle at 10% 6%, rgba(34,211,238,0.18) 0, transparent 36%), radial-gradient(circle at 88% 10%, rgba(96,165,250,0.14) 0, transparent 40%), #050f22`,
  },
  {
    id: 'volcanic',
    colorScheme: '1one-volcanic',
    theme: 'dark',
    label: '熔岩橙',
    gradient: 'radial-gradient(circle at 30% 30%, #fb923c 0%, #2a1810 55%, #140c06 100%)',
    bodyBg: `radial-gradient(circle at 15% 8%, rgba(251,146,60,0.20) 0, transparent 35%), radial-gradient(circle at 85% 15%, rgba(245,158,11,0.16) 0, transparent 42%), #130b05`,
  },
  {
    id: 'deep-forest',
    colorScheme: '1one-forest',
    theme: 'dark',
    label: '深林绿',
    gradient: 'radial-gradient(circle at 30% 30%, #34d399 0%, #112c22 55%, #071a10 100%)',
    bodyBg: `radial-gradient(circle at 8% 8%, rgba(52,211,153,0.18) 0, transparent 38%), radial-gradient(circle at 88% 12%, rgba(34,197,94,0.13) 0, transparent 44%), #061710`,
  },
  {
    id: 'aurora',
    colorScheme: '1one-aurora',
    theme: 'dark',
    label: '极光紫',
    gradient: 'radial-gradient(circle at 30% 30%, #a78bfa 0%, #160f30 45%, #e879f9 80%, #080616 100%)',
    bodyBg: `radial-gradient(ellipse at 10% 5%, rgba(167,139,250,0.26) 0, transparent 40%), radial-gradient(ellipse at 90% 8%, rgba(232,121,249,0.16) 0, transparent 45%), #070515`,
  },
  {
    id: 'moonlight',
    colorScheme: '1one-moonlight',
    theme: 'light',
    label: '月光银',
    gradient: 'linear-gradient(135deg, #f3f6fb 0%, #bbc7e0 40%, #0369a1 100%)',
    bodyBg: '#f0f4fb',
  },
];

const STORAGE_KEY = '1one-theme';

async function applyTheme(t: ThemeItem) {
  document.documentElement.setAttribute('data-color-scheme', t.colorScheme);
  document.documentElement.setAttribute('data-theme', t.theme);
  document.body.setAttribute('arco-theme', t.theme);
  document.body.style.background = t.bodyBg;
  localStorage.setItem(STORAGE_KEY, t.id);
  localStorage.setItem('__1one_theme', t.theme);
  localStorage.setItem('__1one_colorScheme', t.colorScheme);
  // 临时禁用ConfigStorage调用以修复卡死问题
  // try {
  //   await ConfigStorage.set('colorScheme', t.colorScheme as never);
  //   await ConfigStorage.set('theme', t.theme as never);
  // } catch (_e) { /* noop */ }
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  theme,
  siderTooltipProps,
  onSettingsClick,
  onThemeToggle,
}) => {
  const { t } = useTranslation();

  const [currentTheme, setCurrentTheme] = useState<ThemeItem>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.find(th => th.id === saved) ?? THEMES[0];
  });

  const handleSelectTheme = useCallback((th: ThemeItem) => {
    setCurrentTheme(th);
    void applyTheme(th);
    // 同步父组件的 light/dark 状态（月光银=亮色，其他=暗色）
    if (th.theme === 'light' && theme === 'dark') onThemeToggle();
    if (th.theme === 'dark' && theme === 'light') onThemeToggle();
  }, [theme, onThemeToggle]);

  // 挂载时立即应用已保存的主题，确保 DOM 与 localStorage 同步
  useEffect(() => {
    void applyTheme(currentTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className='shrink-0 sider-footer mt-auto pt-8px'>
      <div className='flex flex-col gap-2px'>
        {/* 主题行：合并了亮暗切换 + 6个颜色方案 */}
        {isSettings && (
          <div
            className={classNames(
              'flex items-center justify-between px-12px py-6px rd-0.5rem',
              isMobile && 'sider-footer-btn-mobile'
            )}
          >
            {/* 左侧：亮/暗切换按钮 */}
            <Tooltip
              {...siderTooltipProps}
              content={theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
              position='right'
            >
              <div
                onClick={onThemeToggle}
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

            {/* 右侧：6个颜色圆点 */}
            <div className='collapsed-hidden flex items-center gap-4px'>
              {THEMES.map((th) => (
                <Tooltip key={th.id} content={th.label} position='top' mini>
                  <div
                    onClick={() => handleSelectTheme(th)}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: th.gradient,
                      cursor: 'pointer',
                      border: currentTheme.id === th.id
                        ? `2px solid ${th.theme === 'light' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)'}`
                        : `2px solid rgba(128,128,128,0.2)`,
                      boxShadow: currentTheme.id === th.id
                        ? `0 0 0 1px rgba(255,255,255,0.2), 0 0 6px rgba(255,255,255,0.2)`
                        : 'none',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.25)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        {/* 设置/返回聊天按钮 */}
        <Tooltip {...siderTooltipProps} content={isSettings ? t('common.back') : t('common.settings')} position='right'>
          <div
            onClick={onSettingsClick}
            className={classNames(
              'flex items-center justify-start gap-10px px-12px py-8px rd-0.5rem cursor-pointer transition-colors',
              isMobile && 'sider-footer-btn-mobile',
              {
                'bg-[rgba(var(--primary-6),0.12)] text-primary': isSettings,
                'hover:bg-hover hover:shadow-sm active:bg-fill-2': !isSettings,
              }
            )}
          >
            {isSettings ? (
              <ArrowCircleLeft className='flex' theme='outline' size='24' fill={iconColors.primary} />
            ) : (
              <SettingTwo className='flex' theme='outline' size='24' fill={iconColors.primary} />
            )}
            <span className='collapsed-hidden text-t-primary'>
              {isSettings ? t('common.back') : t('common.settings')}
            </span>
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default SiderFooter;
