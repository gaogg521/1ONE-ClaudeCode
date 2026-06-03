import { DeleteOne, EditOne, Peoples, Plus, Pushpin } from '@icon-park/react';
import { Input, Message, Modal, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { iconColors } from '@renderer/styles/colors';
import { usePreviewContext } from '@renderer/pages/conversation/Preview/context/PreviewContext';
import { cleanupSiderTooltips, getSiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { blurActiveElement } from '@renderer/utils/ui/focus';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import type { ColorScheme } from '@renderer/hooks/ui/useColorScheme';
import type { Theme } from '@renderer/hooks/system/useTheme';
import { useTeamList } from '@renderer/pages/team/hooks/useTeamList';
import { useSWRConfig } from 'swr';
import TeamCreateModal from '@renderer/pages/team/components/TeamCreateModal';
import { ipcBridge } from '@/common';
import SiderItem from './SiderItem';
import type { SiderMenuItem } from './SiderItem';
import SiderToolbar from './SiderToolbar';
import SiderFooter from './SiderFooter';
import SidebarModuleNav from './SidebarModuleNav';
import { shouldShowSessionSidebarContent } from '@/renderer/components/layout/sidebarNav';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';

const TEAM_PINNED_KEY = 'team-pinned-ids';

interface SiderProps {
  onSessionClick?: () => void;
  collapsed?: boolean;
}

const Sider: React.FC<SiderProps> = ({ onSessionClick, collapsed = false }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const location = useLocation();
  const { pathname } = location;

  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closePreview } = usePreviewContext();
  const { theme, setTheme, setColorScheme } = useThemeContext();
  const [createTeamVisible, setCreateTeamVisible] = useState(false);
  const { teams, mutate: refreshTeams, removeTeam } = useTeamList();
  const { mutate: globalMutate } = useSWRConfig();

  // Pin state
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(TEAM_PINNED_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  });

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(TEAM_PINNED_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Rename state
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameId || !renameName.trim()) return;
    setRenameLoading(true);
    try {
      const tenantId = teams.find((team) => team.id === renameId)?.tenantId;
      await ipcBridge.team.renameTeam.invoke({ id: renameId, tenantId, name: renameName.trim() });
      await refreshTeams();
      await globalMutate(tenantId ? `team/${tenantId}/${renameId}` : `team/${renameId}`);
      Message.success(t('team.sider.renameSuccess'));
      setRenameVisible(false);
      setRenameId(null);
      setRenameName('');
    } catch (err) {
      console.error('Failed to rename team:', err);
      Message.error(t('team.sider.rename'));
    } finally {
      setRenameLoading(false);
    }
  }, [globalMutate, renameId, renameName, refreshTeams, teams, t]);

  // Sorted teams: pinned first
  const sortedTeams = useMemo(() => {
    const pinned = teams.filter((team) => pinnedIds.includes(team.id));
    const unpinned = teams.filter((team) => !pinnedIds.includes(team.id));
    return [...pinned, ...unpinned];
  }, [teams, pinnedIds]);
  const { showTeamsFeature, isEnterpriseEdition, hasInstanceEnterprise, hasJoinedEnterprise } =
    useEditionFeatures();
  const isSettings = pathname.startsWith('/settings');

  useEffect(() => {
    if (!isSettings) return;
    void Promise.all([
      import('@renderer/pages/settings/AgentSettings'),
      import('@renderer/pages/settings/AssistantSettings'),
      import('@renderer/pages/settings/SkillsHubSettings'),
      import('@renderer/pages/settings/AionrsSettings'),
      import('@renderer/pages/settings/GeminiSettings'),
      import('@renderer/pages/settings/ModeSettings'),
      import('@renderer/pages/settings/SystemSettings'),
      import('@renderer/pages/settings/ToolsSettings'),
      import('@renderer/pages/settings/WebuiSettings'),
      import('@renderer/pages/settings/EnterpriseSettingsShell'),
      import('@renderer/pages/settings/ExtensionSettingsPage'),
    ]).catch(() => {});
  }, [isSettings]);

  const handleNewChat = () => {
    cleanupSiderTooltips();
    blurActiveElement();
    closePreview();
    Promise.resolve(navigate('/guid')).catch((error) => {
      console.error('Navigation failed:', error);
    });
    if (onSessionClick) {
      onSessionClick();
    }
  };

  const handleThemePresetApplied = useCallback(
    (preset: { colorScheme: ColorScheme; theme: Theme }) => {
      void setColorScheme(preset.colorScheme);
      void setTheme(preset.theme);
    },
    [setColorScheme, setTheme]
  );

  const tooltipEnabled = collapsed && !isMobile;
  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);

  const showChatSidebarPanel = shouldShowSessionSidebarContent(pathname);

  return (
    <div className='size-full flex flex-col min-h-0'>
      <div className='shrink-0'>
        <SidebarModuleNav
          collapsed={collapsed}
          isMobile={isMobile}
          siderTooltipProps={siderTooltipProps}
          onNavigate={onSessionClick}
        />
        <SiderToolbar
          isMobile={isMobile}
          collapsed={collapsed}
          siderTooltipProps={siderTooltipProps}
          onNewChat={handleNewChat}
        />
      </div>
      {showChatSidebarPanel ? (
        <div className='flex-1 min-h-0 overflow-y-auto'>
              {/* Team section — 企业版且已加入企业 */}
              {isEnterpriseEdition && hasInstanceEnterprise && !hasJoinedEnterprise && !collapsed ? (
                <div className='shrink-0 mb-8px px-12px py-8px rd-8px border border-dashed border-border-2 bg-fill-2'>
                  <span className='text-12px text-t-tertiary leading-relaxed'>
                    {t('settings.edition.teamsNeedJoin', {
                      defaultValue: '加入企业后，可在此创建与管理「团队」协作会话。',
                    })}
                  </span>
                </div>
              ) : null}
              {showTeamsFeature && collapsed ? (
                <div className='shrink-0 mb-4px'>
                  <Tooltip
                    {...siderTooltipProps}
                    content={t('team.sider.createTeam', { defaultValue: '新建团队' })}
                    position='right'
                  >
                    <div
                      className='w-full py-6px flex items-center justify-center cursor-pointer transition-colors rd-8px hover:bg-fill-3 active:bg-fill-4'
                      onClick={() => setCreateTeamVisible(true)}
                    >
                      <Plus theme='outline' size='20' fill={iconColors.primary} style={{ lineHeight: 0 }} />
                    </div>
                  </Tooltip>
                  {sortedTeams.length > 0 &&
                    sortedTeams.map((team) => {
                      const isActive = pathname.startsWith(`/team/${team.id}`);
                      return (
                        <Tooltip key={team.id} {...siderTooltipProps} content={team.name} position='right'>
                          <div
                            className={classNames(
                              'w-full py-6px flex items-center justify-center cursor-pointer transition-colors rd-8px',
                              isActive
                                ? 'bg-[rgba(var(--primary-6),0.12)] text-primary'
                                : 'hover:bg-fill-3 active:bg-fill-4'
                            )}
                            onClick={() => {
                              cleanupSiderTooltips();
                              blurActiveElement();
                              Promise.resolve(navigate(`/team/${team.id}`)).catch(console.error);
                              if (onSessionClick) onSessionClick();
                            }}
                          >
                            <Peoples
                              theme='outline'
                              size='20'
                              fill={isActive ? 'rgb(var(--primary-6))' : iconColors.primary}
                              style={{ lineHeight: 0 }}
                            />
                          </div>
                        </Tooltip>
                      );
                    })}
                </div>
              ) : showTeamsFeature ? (
                <div className='shrink-0 mb-4px'>
                  <div className='flex items-center justify-between px-12px py-8px'>
                    <span className='text-13px text-t-secondary font-bold leading-20px'>
                      {isEnterpriseEdition
                        ? t('team.sider.titleEnterprise', { defaultValue: '团队（1ONE Code 企业版）' })
                        : t('team.sider.title', { defaultValue: '团队' })}
                    </span>
                    <div
                      className='h-20px w-20px rd-4px flex items-center justify-center cursor-pointer hover:bg-fill-3 transition-all shrink-0'
                      onClick={() => setCreateTeamVisible(true)}
                    >
                      <Plus theme='outline' size='14' fill='var(--color-text-2)' />
                    </div>
                  </div>
                  {sortedTeams.length > 0 &&
                    sortedTeams.map((team) => {
                      const isPinned = pinnedIds.includes(team.id);
                      const menuItems: SiderMenuItem[] = [
                        {
                          key: 'pin',
                          icon: <Pushpin theme='outline' size='14' />,
                          label: isPinned ? t('team.sider.unpin') : t('team.sider.pin'),
                        },
                        {
                          key: 'rename',
                          icon: <EditOne theme='outline' size='14' />,
                          label: t('team.sider.rename'),
                        },
                        {
                          key: 'delete',
                          icon: <DeleteOne theme='outline' size='14' />,
                          label: t('team.sider.delete'),
                          danger: true,
                        },
                      ];
                      return (
                        <SiderItem
                          key={team.id}
                          icon={
                            <Peoples theme='outline' size='20' fill={iconColors.primary} style={{ lineHeight: 0 }} />
                          }
                          name={team.name}
                          selected={pathname.startsWith(`/team/${team.id}`)}
                          pinned={isPinned}
                          menuItems={menuItems}
                          onMenuAction={(key) => {
                            if (key === 'pin') {
                              togglePin(team.id);
                            } else if (key === 'rename') {
                              setRenameId(team.id);
                              setRenameName(team.name);
                              setRenameVisible(true);
                            } else if (key === 'delete') {
                              Modal.confirm({
                                title: t('team.sider.deleteConfirm'),
                                content: t('team.sider.deleteConfirmContent'),
                                okText: t('team.sider.deleteOk'),
                                cancelText: t('team.sider.deleteCancel'),
                                okButtonProps: { status: 'warning' },
                                onOk: async () => {
                                  await removeTeam(team.id);
                                  Message.success(t('team.sider.deleteSuccess'));
                                  if (pathname.startsWith(`/team/${team.id}`)) {
                                    Promise.resolve(navigate('/sessions')).catch(() => {});
                                  }
                                },
                                style: { borderRadius: '12px' },
                                alignCenter: true,
                                getPopupContainer: () => document.body,
                              });
                            }
                          }}
                          onClick={() => {
                            cleanupSiderTooltips();
                            blurActiveElement();
                            Promise.resolve(navigate(`/team/${team.id}`)).catch(console.error);
                            if (onSessionClick) onSessionClick();
                          }}
                        />
                      );
                    })}
                </div>
              ) : null}
        </div>
      ) : (
        <div className='flex-1 min-h-0' aria-hidden='true' />
      )}
      <div className='shrink-0'>
        <SiderFooter
          isMobile={isMobile}
          collapsed={collapsed}
          theme={theme}
          siderTooltipProps={siderTooltipProps}
          onThemeToggle={() => void setTheme(theme === 'dark' ? 'light' : 'dark')}
          onThemePresetApplied={handleThemePresetApplied}
        />
      </div>
      <TeamCreateModal
        visible={createTeamVisible}
        onClose={() => setCreateTeamVisible(false)}
        onCreated={(team) => {
          void refreshTeams();
          Promise.resolve(navigate(`/team/${team.id}`)).catch(console.error);
        }}
      />
      <Modal
        title={t('team.sider.renameTitle')}
        visible={renameVisible}
        onOk={() => void handleRenameConfirm()}
        onCancel={() => {
          setRenameVisible(false);
          setRenameId(null);
          setRenameName('');
        }}
        okText={t('team.sider.renameOk')}
        cancelText={t('team.sider.renameCancel')}
        confirmLoading={renameLoading}
        okButtonProps={{ disabled: !renameName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameName}
          onChange={setRenameName}
          onPressEnter={() => void handleRenameConfirm()}
          placeholder={t('team.sider.renamePlaceholder')}
          allowClear
        />
      </Modal>
    </div>
  );
};

export default Sider;
