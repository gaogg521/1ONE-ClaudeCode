/**
 * ThemeSwitcher — 1ONE ClaudeCode 6套主题切换器
 * 在 ModuleNav 底部显示，点击切换主题，渐变色与实际主题完全对应
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Tooltip } from '@arco-design/web-react';
import { ConfigStorage } from '@/common/config/storage';

interface Theme {
  id: string;
  colorScheme: string;
  theme: string;
  label: string;
  gradient: string;   // 小圆点渐变，与实际主题背景对应
  bodyBg: string;     // 直接注入 body.style.background，确保切换彻底
}

const THEMES: Theme[] = [
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
    bodyBg: `radial-gradient(circle at 10% 6%, rgba(34,211,238,0.20) 0, transparent 36%),
             radial-gradient(circle at 88% 10%, rgba(96,165,250,0.16) 0, transparent 40%),
             radial-gradient(circle at 50% 95%, rgba(34,211,238,0.08) 0, transparent 50%),
             #061126`,
  },
  {
    id: 'volcanic',
    colorScheme: '1one-volcanic',
    theme: 'dark',
    label: '熔岩橙',
    gradient: 'radial-gradient(circle at 30% 30%, #fb923c 0%, #2a1810 55%, #140c06 100%)',
    bodyBg: `radial-gradient(circle at 15% 8%, rgba(251,146,60,0.22) 0, transparent 35%),
             radial-gradient(circle at 85% 15%, rgba(245,158,11,0.18) 0, transparent 42%),
             radial-gradient(circle at 50% 100%, rgba(251,146,60,0.10) 0, transparent 55%),
             #140c06`,
  },
  {
    id: 'deep-forest',
    colorScheme: '1one-forest',
    theme: 'dark',
    label: '深林绿',
    gradient: 'radial-gradient(circle at 30% 30%, #34d399 0%, #112c22 55%, #071a10 100%)',
    bodyBg: `radial-gradient(circle at 8% 8%, rgba(52,211,153,0.20) 0, transparent 38%),
             radial-gradient(circle at 88% 12%, rgba(34,197,94,0.15) 0, transparent 44%),
             radial-gradient(circle at 45% 96%, rgba(52,211,153,0.08) 0, transparent 52%),
             #071a10`,
  },
  {
    id: 'aurora',
    colorScheme: '1one-aurora',
    theme: 'dark',
    label: '极光紫',
    gradient: 'radial-gradient(circle at 30% 30%, #a78bfa 0%, #160f30 45%, #e879f9 80%, #080616 100%)',
    bodyBg: `radial-gradient(ellipse at 10% 5%, rgba(167,139,250,0.28) 0, transparent 40%),
             radial-gradient(ellipse at 90% 8%, rgba(232,121,249,0.18) 0, transparent 45%),
             radial-gradient(ellipse at 50% 100%, rgba(99,102,241,0.14) 0, transparent 55%),
             radial-gradient(ellipse at 30% 60%, rgba(167,139,250,0.06) 0, transparent 35%),
             #080616`,
  },
  {
    id: 'moonlight',
    colorScheme: '1one-moonlight',
    theme: 'light',
    label: '月光银',
    gradient: 'linear-gradient(135deg, #f3f6fb 0%, #bbc7e0 40%, #0369a1 100%)',
    bodyBg: '#f3f6fb',
  },
];

const STORAGE_KEY = 'one-theme';

async function applyTheme(t: Theme) {
  // 1. DOM 属性 — CSS 变量切换
  document.documentElement.setAttribute('data-color-scheme', t.colorScheme);
  document.documentElement.setAttribute('data-theme', t.theme);
  document.body.setAttribute('arco-theme', t.theme);

  // 2. 直接注入 body background，确保切换彻底（不依赖 CSS 级联优先级）
  document.body.style.background = t.bodyBg;

  // 3. localStorage 快速恢复（防止刷新闪烁）
  localStorage.setItem(STORAGE_KEY, t.id);
  localStorage.setItem('__1one_theme', t.theme);
  localStorage.setItem('__1one_colorScheme', t.colorScheme);

  // 4. ConfigStorage 持久化（确保重启后不丢失）
  try {
    await ConfigStorage.set('colorScheme', t.colorScheme as never);
    await ConfigStorage.set('theme', t.theme as never);
  } catch (error) {
    console.error('[ThemeSwitcher] Failed to persist theme to ConfigStorage:', error);
  }
}

const ThemeSwitcher: React.FC = () => {
  const [current, setCurrent] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return THEMES.find(t => t.id === saved) ?? THEMES[0];
  });

  const handleSelect = useCallback((t: Theme) => {
    setCurrent(t);
    void applyTheme(t);
  }, []);

  // 挂载时立即应用，防止 ConfigStorage 初始化时覆盖 ThemeSwitcher 的选择
  useEffect(() => {
    void applyTheme(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '6px 4px',
        flexWrap: 'wrap',
        width: '100%',
      }}
    >
      {THEMES.map((t) => (
        <Tooltip key={t.id} content={t.label} position='right' mini>
          <div
            onClick={() => handleSelect(t)}
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: t.gradient,
              cursor: 'pointer',
              border: current.id === t.id
                ? `2px solid ${t.theme === 'light' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.9)'}`
                : `2px solid ${t.theme === 'light' ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`,
              boxShadow: current.id === t.id
                ? t.theme === 'light'
                  ? `0 0 0 1px rgba(0,0,0,0.2), 0 0 8px rgba(0,0,0,0.15)`
                  : `0 0 0 1px rgba(255,255,255,0.3), 0 0 8px rgba(255,255,255,0.25)`
                : 'none',
              transition: 'all 0.18s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'scale(1.28)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
            }}
          />
        </Tooltip>
      ))}
    </div>
  );
};

export default ThemeSwitcher;
