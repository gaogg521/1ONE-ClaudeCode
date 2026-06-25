import classNames from 'classnames';
import React from 'react';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import { SettingsViewModeProvider } from '@/renderer/components/settings/SettingsModal/settingsViewContext';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import type { IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtensionSettingsTabs } from '@/renderer/hooks/extensions/useExtensionSettingsTabs';
import {
  Analysis,
  Communication,
  Earth,
  LinkCloud,
  Puzzle,
  Robot,
  System,
  Toolkit,
} from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { BUILTIN_TAB_IDS, resolveSettingsTabAnchor } from './SettingsSider';
import './settings.css';

interface SettingsPageWrapperProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

type NavItem = { label: string; icon: React.ReactElement; path: string; id: string };

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

export function getBuiltinSettingsNavItems(isDesktop: boolean, t: TranslateFn, isPersonalEdition = false): NavItem[] {
  const builtinMap: Record<string, NavItem> = {
    model: { id: 'model', label: t('settings.model'), icon: <LinkCloud theme='outline' size='16' />, path: 'model' },
    assistants: {
      id: 'assistants',
      label: t('settings.assistants', { defaultValue: 'Assistants' }),
      icon: <Robot theme='outline' size='16' />,
      path: 'assistants',
    },
    agent: {
      id: 'agent',
      label: t('settings.agents', { defaultValue: 'Agents' }),
      icon: <Robot theme='outline' size='16' />,
      path: 'agent',
    },
    'skills-hub': {
      id: 'skills-hub',
      label: t('settings.skillsHub.title', { defaultValue: 'Skills Hub' }),
      icon: <Puzzle theme='outline' size='16' />,
      path: 'skills-hub',
    },
    tools: { id: 'tools', label: t('settings.tools'), icon: <Toolkit theme='outline' size='16' />, path: 'tools' },
    webui: {
      id: 'webui',
      label: t('settings.webui'),
      icon: isDesktop ? <Earth theme='outline' size='16' /> : <Communication theme='outline' size='16' />,
      path: 'webui',
    },
    system: { id: 'system', label: t('settings.system'), icon: <System theme='outline' size='16' />, path: 'system' },
  };

  if (isPersonalEdition) {
    builtinMap.usage = {
      id: 'usage',
      label: t('settings.usage', { defaultValue: '使用统计' }),
      icon: <Analysis theme='outline' size='16' />,
      path: 'usage',
    };
  }

  const order = isPersonalEdition ? [...BUILTIN_TAB_IDS, 'usage' as const] : BUILTIN_TAB_IDS;
  return order.map((id) => builtinMap[id]).filter(Boolean);
}

const SettingsPageWrapper: React.FC<SettingsPageWrapperProps> = ({ children, className, contentClassName }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const isDesktop = isElectronDesktop();
  const { isPersonalEdition } = useEditionFeatures();
  const isWorkspaceScoped = pathname.startsWith('/workspace/settings/');

  const { extensionTabs } = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();

  // Preload common settings pages on idle to reduce first-switch jank.
  React.useEffect(() => {
    const preload = () => {
      void Promise.allSettled([
        import('@renderer/pages/settings/ModeSettings'),
        import('@renderer/components/settings/SettingsModal/contents/ModelModalContent'),
        import('@renderer/pages/settings/AssistantSettings'),
        import('@renderer/pages/settings/ToolsSettings'),
        import('@renderer/pages/settings/AgentSettings'),
        import('@renderer/pages/settings/SkillsHubSettings'),
      ]);
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof w.requestIdleCallback === 'function') {
      const idleId = w.requestIdleCallback(preload, { timeout: 1500 });
      return () => w.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(preload, 300);
    return () => window.clearTimeout(timer);
  }, []);

  const menuItems = React.useMemo(() => {
    const builtins = getBuiltinSettingsNavItems(isDesktop, t, isPersonalEdition);

    // Insert extension tabs before system (unanchored default) or at anchor position
    const result = [...builtins];
    const unanchored: IExtensionSettingsTab[] = [];
    const beforeMap = new Map<string, IExtensionSettingsTab[]>();
    const afterMap = new Map<string, IExtensionSettingsTab[]>();

    for (const tab of extensionTabs) {
      if (!tab.position) {
        unanchored.push(tab);
        continue;
      }
      const map = tab.position.placement === 'before' ? beforeMap : afterMap;
      const anchor = resolveSettingsTabAnchor(tab.position.anchor);
      let list = map.get(anchor);
      if (!list) {
        list = [];
        map.set(anchor, list);
      }
      list.push(tab);
    }

    const toNavItem = (tab: IExtensionSettingsTab): NavItem => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      return {
        id: tab.id,
        label: resolveExtTabName(tab),
        icon: resolvedIcon ? (
          <img src={resolvedIcon} alt='' className='w-16px h-16px object-contain' />
        ) : (
          <Puzzle theme='outline' size='16' />
        ),
        path: `ext/${tab.id}`,
      };
    };

    for (let i = result.length - 1; i >= 0; i--) {
      const id = result[i].id;
      const afters = afterMap.get(id);
      if (afters) result.splice(i + 1, 0, ...afters.map(toNavItem));
      const befores = beforeMap.get(id);
      if (befores) result.splice(i, 0, ...befores.map(toNavItem));
    }

    if (unanchored.length > 0) {
      const sysIdx = result.findIndex((item) => item.id === 'system');
      const idx = sysIdx >= 0 ? sysIdx : result.length;
      result.splice(idx, 0, ...unanchored.map(toNavItem));
    }

    return result;
  }, [isDesktop, t, extensionTabs, resolveExtTabName]);

  const contentClass = classNames('settings-page-content mx-auto w-full md:max-w-1024px', contentClassName);
  const renderTopNavItem = (item: NavItem, mobile = false) => {
    const itemRoute = `/settings/${item.path}`;
    const active = pathname === itemRoute;

    return (
      <button
        key={item.path}
        type='button'
        className={classNames(mobile ? 'settings-mobile-top-nav__item' : 'settings-desktop-top-nav__item', {
          'settings-mobile-top-nav__item--active': mobile && active,
          'settings-desktop-top-nav__item--active': !mobile && active,
        })}
        onClick={() => {
          void navigate(itemRoute, { replace: true });
        }}
      >
        <span className={mobile ? 'settings-mobile-top-nav__icon' : 'settings-desktop-top-nav__icon'}>{item.icon}</span>
        <span className={mobile ? 'settings-mobile-top-nav__label' : 'settings-desktop-top-nav__label'}>{item.label}</span>
      </button>
    );
  };

  if (isWorkspaceScoped) {
    return (
      <SettingsViewModeProvider value='page'>
        <div className={classNames('settings-page-wrapper w-full', className)}>
          <div className={classNames('settings-page-content w-full', contentClassName)}>{children}</div>
        </div>
      </SettingsViewModeProvider>
    );
  }

  return (
    <SettingsViewModeProvider value='page'>
      <PageContentShell
        className={classNames('settings-page-wrapper', className)}
        contentClassName={contentClass}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        header={
          isMobile ? (
            <div className='settings-mobile-top-nav'>
              {menuItems.map((item) => renderTopNavItem(item, true))}
            </div>
          ) : (
            <div className='settings-desktop-top-nav'>
              <div className='settings-desktop-top-nav__title'>
                {t('nav.globalSettings', { defaultValue: '全局设置' })}
              </div>
              <div className='settings-desktop-top-nav__grid'>{menuItems.map((item) => renderTopNavItem(item))}</div>
            </div>
          )
        }
      >
        {children}
      </PageContentShell>
    </SettingsViewModeProvider>
  );
};

export default SettingsPageWrapper;
