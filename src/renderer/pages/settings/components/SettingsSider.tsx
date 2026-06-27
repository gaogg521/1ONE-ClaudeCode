import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import type { IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtensionSettingsTabs } from '@/renderer/hooks/extensions/useExtensionSettingsTabs';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { useShowUsageStats } from '@/renderer/hooks/system/useShowUsageStats';
import {
  Analysis,
  Communication,
  Earth,
  Lightning,
  LinkCloud,
  Puzzle,
  Robot,
  Speed,
  System,
  Toolkit,
} from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@arco-design/web-react';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

/** Builtin settings tab IDs in display order (must match router paths). */
export const BUILTIN_TAB_IDS = [
  'agent',
  'model',
  'assistants',
  'skills-hub',
  'tools',
  'webui',
  'system',
] as const;

/** Remap removed builtin tab anchors so extension tabs keep a stable insertion point. */
export function resolveSettingsTabAnchor(anchor: string): string {
  if (anchor === 'display') return 'tools';
  return anchor;
}

type SiderItem = {
  id: string;
  label: string;
  icon: React.ReactElement;
  isImageIcon?: boolean;
  /** Route path segment — for builtins: `/settings/{path}`, for extensions: `/settings/ext/{id}` */
  path: string;
};

const SettingsSider: React.FC<{ collapsed?: boolean; tooltipEnabled?: boolean }> = ({
  collapsed = false,
  tooltipEnabled = false,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isDesktop = isElectronDesktop();
  const { isPersonalEdition } = useEditionFeatures();
  const showUsageStats = useShowUsageStats();

  const { extensionTabs } = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();
  const menus: SiderItem[] = useMemo(() => {
    // Build builtin items
    const builtinMap: Record<string, SiderItem> = {
      model: { id: 'model', label: t('settings.model'), icon: <LinkCloud />, path: 'model' },
      assistants: {
        id: 'assistants',
        label: t('settings.assistants', { defaultValue: 'Assistants' }),
        icon: <Robot />,
        path: 'assistants',
      },
      agent: {
        id: 'agent',
        label: t('settings.agents', { defaultValue: 'Agents' }),
        icon: <Speed />,
        path: 'agent',
      },
      'skills-hub': {
        id: 'skills-hub',
        label: t('settings.skillsHub.title', { defaultValue: 'Skills Hub' }),
        icon: <Lightning />,
        path: 'skills-hub',
      },
      tools: { id: 'tools', label: t('settings.tools'), icon: <Toolkit />, path: 'tools' },
      webui: {
        id: 'webui',
        label: t('settings.webui'),
        icon: isDesktop ? <Earth /> : <Communication />,
        path: 'webui',
      },
      system: { id: 'system', label: t('settings.system'), icon: <System />, path: 'system' },
    };

    // 个人版在「系统」后追加「使用统计」入口（需用户在系统设置中手动开启，默认隐藏）。
    if (isPersonalEdition && showUsageStats) {
      builtinMap.usage = {
        id: 'usage',
        label: t('settings.usage', { defaultValue: '使用统计' }),
        icon: <Analysis />,
        path: 'usage',
      };
    }

    const builtinOrder = isPersonalEdition && showUsageStats ? [...BUILTIN_TAB_IDS, 'usage' as const] : BUILTIN_TAB_IDS;
    const result: SiderItem[] = builtinOrder.map((id) => builtinMap[id]).filter(Boolean);

    // Extension tabs with position anchoring
    const beforeMap = new Map<string, IExtensionSettingsTab[]>();
    const afterMap = new Map<string, IExtensionSettingsTab[]>();
    const unanchored: IExtensionSettingsTab[] = [];

    for (const tab of extensionTabs) {
      if (!tab.position) {
        unanchored.push(tab);
        continue;
      }
      const { placement } = tab.position;
      const anchor = resolveSettingsTabAnchor(tab.position.anchor);
      const map = placement === 'before' ? beforeMap : afterMap;
      let list = map.get(anchor);
      if (!list) {
        list = [];
        map.set(anchor, list);
      }
      list.push(tab);
    }

    // Helper to create SiderItem from extension tab
    const toSiderItem = (tab: IExtensionSettingsTab): SiderItem => {
      const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
      return {
        id: tab.id,
        label: resolveExtTabName(tab),
        icon: resolvedIcon ? <img src={resolvedIcon} alt='' className='w-full h-full object-contain' /> : <Puzzle />,
        isImageIcon: Boolean(resolvedIcon),
        path: `ext/${tab.id}`,
      };
    };

    // Insert anchored tabs (reverse iteration to preserve indices)
    for (let i = result.length - 1; i >= 0; i--) {
      const builtinId = result[i].id;
      const afters = afterMap.get(builtinId);
      if (afters) {
        result.splice(i + 1, 0, ...afters.map(toSiderItem));
      }
      const befores = beforeMap.get(builtinId);
      if (befores) {
        result.splice(i, 0, ...befores.map(toSiderItem));
      }
    }

    // Append unanchored before "system"
    if (unanchored.length > 0) {
      const systemIdx = result.findIndex((item) => item.id === 'system');
      const insertIdx = systemIdx >= 0 ? systemIdx : result.length;
      result.splice(insertIdx, 0, ...unanchored.map(toSiderItem));
    }

    return result;
  }, [t, isDesktop, extensionTabs, resolveExtTabName, isPersonalEdition, showUsageStats]);

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  return (
    <div
      className={classNames('flex-1 min-h-0 settings-sider flex flex-col gap-2px overflow-y-auto overflow-x-hidden', {
        'settings-sider--collapsed': collapsed,
      })}
    >
      {!collapsed ? (
        <div className='settings-sider__section-title'>
          {t('nav.globalSettings', { defaultValue: '全局设置' })}
        </div>
      ) : null}
      {menus.map((item) => {
        const itemRoute = `/settings/${item.path}`;
        const isSelected = pathname === itemRoute;
        return (
          <Tooltip key={item.id} {...siderTooltipProps} content={item.label} position='right'>
            <div
              data-settings-id={item.id}
              data-settings-path={item.path}
              className={classNames(
                'settings-sider__item px-12px py-10px rd-12px flex justify-start items-center group cursor-pointer relative overflow-hidden shrink-0',
                {
                  'settings-sider__item--active': isSelected,
                }
              )}
              onClick={() => {
                navigate(itemRoute, { replace: true });
              }}
            >
              {item.isImageIcon ? (
                <div className='settings-sider__item-icon mt-2px ml-2px mr-8px flex shrink-0 items-center justify-center'>
                  {item.icon}
                </div>
              ) : (
                React.cloneElement(
                  item.icon as React.ReactElement<{
                    theme?: string;
                    size?: string | number;
                    className?: string;
                    strokeWidth?: number;
                  }>,
                  {
                    theme: 'outline',
                    size: '20',
                    strokeWidth: 3,
                    className: 'settings-sider__item-icon mt-2px ml-2px mr-8px flex',
                  }
                )
              )}
              <FlexFullContainer className='h-24px'>
                <div className='settings-sider__item-label text-nowrap overflow-hidden inline-block w-full text-14px lh-24px whitespace-nowrap'>
                  {item.label}
                </div>
              </FlexFullContainer>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

export default SettingsSider;
