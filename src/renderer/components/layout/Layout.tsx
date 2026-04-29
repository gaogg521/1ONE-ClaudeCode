/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import PwaPullToRefresh from '@/renderer/components/layout/PwaPullToRefresh';
import Titlebar from '@/renderer/components/layout/Titlebar';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { Tooltip } from '@arco-design/web-react';
import { MenuFold, MenuUnfold, CommentOne, FolderOpen, Checklist, Lightning, Server, Brain, AlarmClock, Setting, People } from '@icon-park/react';
import classNames from 'classnames';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutContext } from '@renderer/hooks/context/LayoutContext';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useDeepLink } from '@renderer/hooks/system/useDeepLink';
import { useNotificationClick } from '@renderer/hooks/system/useNotificationClick';
import { useDirectorySelection } from '@renderer/hooks/file/useDirectorySelection';
import { useMultiAgentDetection } from '@renderer/hooks/agent/useMultiAgentDetection';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { useConversationShortcuts } from '@renderer/hooks/ui/useConversationShortcuts';
import { isElectronDesktop } from '@renderer/utils/platform';
import '@renderer/styles/layout.css';

const useDebug = () => {
  const [count, setCount] = useState(0);
  const timer = useRef<any>(null);
  const onClick = () => {
    const open = () => {
      ipcBridge.application.openDevTools.invoke().catch((error) => {
        console.error('Failed to open dev tools:', error);
      });
      setCount(0);
    };
    if (count >= 7) {
      return open();
    }
    setCount((prev) => {
      if (prev >= 6) {
        open();
        return 0;
      }
      return prev + 1;
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      clearTimeout(timer.current);
      setCount(0);
    }, 1000);
  };

  return { onClick };
};

const NAV_ITEMS = [
  { icon: <CommentOne theme='outline' size={18} />, labelKey: 'nav.sessions', path: '/sessions', paths: ['/conversation'] },
  { icon: <FolderOpen theme='outline' size={18} />, labelKey: 'nav.workspace', path: '/workspace' },
  { icon: <Checklist theme='outline' size={18} />, labelKey: 'nav.tasks', path: '/tasks' },
  { icon: <People theme='outline' size={18} />, labelKey: 'nav.admin', path: '/settings/enterprise' },
  { icon: <Lightning theme='outline' size={18} />, labelKey: 'nav.hooks', path: '/hooks' },
  { icon: <Server theme='outline' size={18} />, labelKey: 'nav.mcp', path: '/mcp' },
  { icon: <Brain theme='outline' size={18} />, labelKey: 'nav.memory', path: '/memory' },
  { icon: <AlarmClock theme='outline' size={18} />, labelKey: 'nav.scheduled', path: '/scheduled' },
  { icon: <Setting theme='outline' size={18} />, labelKey: 'nav.globalSettings', path: '/settings' },
];

const SidebarNavIcons: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role ?? 'member';
  const canSeeAdmin = role === 'system_admin' || role === 'org_admin' || role === 'admin';
  const items = canSeeAdmin ? NAV_ITEMS : NAV_ITEMS.filter((x) => x.path !== '/settings/enterprise');
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
      padding: '6px 4px',
      borderRight: '1px solid var(--color-border-2)',
      flexShrink: 0,
      width: 48,
    }}>
      {items.map((item) => {
        const allPaths = [item.path, ...(item.paths ?? [])];
        const active = allPaths.some((p) => location.pathname.startsWith(p));
        return (
          <Tooltip key={item.path} content={t(item.labelKey, { defaultValue: item.path })} position='right' mini>
            <div
              onClick={() => navigate(item.path)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: active ? 'var(--color-primary-6)' : 'var(--color-text-3)',
                background: active ? 'rgba(var(--primary-6), 0.12)' : 'transparent',
                border: active ? '1px solid rgba(var(--primary-6), 0.2)' : '1px solid transparent',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--color-fill-3)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--color-text-1)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  (e.currentTarget as HTMLElement).style.color = 'var(--color-text-3)';
                }
              }}
            >
              {item.icon}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

const UpdateModal = React.lazy(() => import('@/renderer/components/settings/UpdateModal'));

const DEFAULT_SIDER_WIDTH = 250;
const DESKTOP_COLLAPSED_WIDTH = 64;
const SIDER_DRAG_SNAP_THRESHOLD = Math.round((DEFAULT_SIDER_WIDTH + DESKTOP_COLLAPSED_WIDTH) / 2);
const SIDER_DRAG_HYSTERESIS = 6;
const MOBILE_SIDER_WIDTH_RATIO = 0.67;
const MOBILE_SIDER_MIN_WIDTH = 260;
const MOBILE_SIDER_MAX_WIDTH = 420;

const detectMobileViewportOrTouch = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (isElectronDesktop()) {
    return window.innerWidth < 768;
  }
  const width = window.innerWidth;
  const byWidth = width < 768;
  // 仅在小屏时才将 coarse/touch 视为移动端，避免触控笔记本被误判
  // Treat touch/coarse pointer as mobile only on smaller viewports
  const smallScreen = width < 1024;
  const byMedia = window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches;
  const byTouchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return byWidth || (smallScreen && (byMedia || byTouchPoints));
};

const Layout: React.FC<{
  sider: React.ReactNode;
  onSessionClick?: () => void;
}> = ({ sider, onSessionClick: _onSessionClick }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 390 : window.innerWidth
  );
  const [shouldMountUpdateModal, setShouldMountUpdateModal] = useState(false);
  const { onClick } = useDebug();
  const { contextHolder: multiAgentContextHolder } = useMultiAgentDetection();
  const { contextHolder: directorySelectionContextHolder } = useDirectorySelection();
  useDeepLink();
  useNotificationClick();
  const navigate = useNavigate();
  useConversationShortcuts({ navigate });
  const location = useLocation();
  const workspaceAvailable = location.pathname.startsWith('/conversation/') || location.pathname.startsWith('/team/') || location.pathname.startsWith('/workspace');
  const collapsedRef = useRef(collapsed);
  const dragStateRef = useRef<{ active: boolean; startX: number; startWidth: number }>({
    active: false,
    startX: 0,
    startWidth: DEFAULT_SIDER_WIDTH,
  });


  // CSS 注入系统已移除（"显示"功能模块已删除）
  // 主题通过 SiderFooter 的 ThemeSwitcher + data-color-scheme CSS 变量实现


  // 检测移动端并响应窗口大小变化
  useEffect(() => {
    const checkMobile = () => {
      const mobile = detectMobileViewportOrTouch();
      setIsMobile(mobile);
      setViewportWidth(window.innerWidth);
    };

    // 初始检测
    checkMobile();

    // 监听窗口大小变化
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 进入移动端后立即折叠 / Collapse immediately when switching to mobile
  useEffect(() => {
    if (!isMobile || collapsedRef.current) {
      return;
    }
    setCollapsed(true);
  }, [isMobile]);

  // 清理侧栏 Tooltip 残留节点，避免移动端路由切换后浮层卡在左上角
  useEffect(() => {
    cleanupSiderTooltips();
  }, [isMobile, collapsed, location.pathname, location.search, location.hash]);

  // Bridge Main Process logs to F12 Console
  useEffect(() => {
    const unsubscribe = ipcBridge.application.logStream.on((entry) => {
      const prefix = `%c[Main:${entry.tag}]%c ${entry.message}`;
      const style = 'color:var(--primary);font-weight:bold';
      if (entry.level === 'error') {
        console.error(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      } else if (entry.level === 'warn') {
        console.warn(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      } else {
        console.log(prefix, style, 'color:inherit', ...(entry.data !== undefined ? [entry.data] : []));
      }
    });
    return () => unsubscribe();
  }, []);

  // Handle tray events from main process / 处理来自主进程的托盘事件
  useEffect(() => {
    if (!isElectronDesktop()) return;

    // Navigate to guid page when requested from tray / 托盘请求导航到 guid 页面
    const handleNavigateToGuid = () => {
      void navigate('/guid');
    };

    // Navigate to conversation when requested from tray / 托盘请求导航到对话页面
    const handleNavigateToConversation = (event: CustomEvent<{ conversationId: string }>) => {
      void navigate(`/conversation/${event.detail.conversationId}`);
    };

    // Open about dialog when requested from tray / 托盘请求打开关于对话框
    const handleOpenAbout = () => {
      // Navigate to settings/about page / 导航到设置/关于页面
      void navigate('/settings/about');
    };

    // Handle pause all tasks request from tray / 托盘请求暂停所有任务
    const handlePauseAllTasks = async () => {
      const { ipcBridge } = await import('@/common');
      const result = await ipcBridge.task.stopAll.invoke();
      if (result?.success) {
        // Navigate to settings page to show task status
        void navigate('/settings/system');
      }
    };

    // Handle check update request from tray / 托盘请求检查更新
    // 1. Navigate to about page / 导航到关于页面
    // 2. Trigger update modal check / 触发更新模态框检查
    const handleCheckUpdate = () => {
      void navigate('/settings/about');
      // Trigger update modal after a short delay to ensure page is loaded
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('one-open-update-modal', { detail: { source: 'tray' } }));
      }, 100);
    };

    // Listen for tray events / 监听托盘事件
    window.addEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
    window.addEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
    window.addEventListener('tray:open-about', handleOpenAbout as EventListener);
    window.addEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
    window.addEventListener('tray:check-update', handleCheckUpdate as EventListener);

    return () => {
      window.removeEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
      window.removeEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
      window.removeEventListener('tray:open-about', handleOpenAbout as EventListener);
      window.removeEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
      window.removeEventListener('tray:check-update', handleCheckUpdate as EventListener);
    };
  }, [navigate]);

  const siderWidth = isMobile
    ? Math.max(
        MOBILE_SIDER_MIN_WIDTH,
        Math.min(MOBILE_SIDER_MAX_WIDTH, Math.round(viewportWidth * MOBILE_SIDER_WIDTH_RATIO))
      )
    : DEFAULT_SIDER_WIDTH;
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  const beginSiderResizeDrag = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isMobile) return;
      event.preventDefault();
      dragStateRef.current = {
        active: true,
        startX: event.clientX,
        startWidth: collapsedRef.current ? DESKTOP_COLLAPSED_WIDTH : DEFAULT_SIDER_WIDTH,
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [isMobile]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState.active) return;

      const draggedWidth = dragState.startWidth + (event.clientX - dragState.startX);
      // Add a small hysteresis zone to avoid rapid toggling near the snap threshold.
      const shouldCollapse = collapsedRef.current
        ? draggedWidth < SIDER_DRAG_SNAP_THRESHOLD + SIDER_DRAG_HYSTERESIS
        : draggedWidth <= SIDER_DRAG_SNAP_THRESHOLD - SIDER_DRAG_HYSTERESIS;
      if (shouldCollapse !== collapsedRef.current) {
        setCollapsed(shouldCollapse);
      }
    };

    const endDrag = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    const handleBlur = () => endDrag();
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('blur', handleBlur);
      endDrag();
    };
  }, []);

  const siderStyle = isMobile
    ? {
        position: 'fixed' as const,
        left: 0,
        zIndex: 100,
        transform: collapsed ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'none',
        pointerEvents: collapsed ? ('none' as const) : ('auto' as const),
      }
    : {
        position: 'relative' as const,
        overflow: 'visible' as const,
      };

  return (
    <LayoutContext.Provider value={{ isMobile, siderCollapsed: collapsed, setSiderCollapsed: setCollapsed }}>
      <div className='app-shell flex flex-col size-full min-h-0'>
        <Titlebar workspaceAvailable={workspaceAvailable} />
        {/* 移动端左侧边栏蒙板 / Mobile left sider backdrop */}
        {isMobile && !collapsed && (
          <div className='fixed inset-0 bg-black/30 z-90' onClick={() => setCollapsed(true)} aria-hidden='true' />
        )}

        <ArcoLayout className={'size-full layout flex-1 min-h-0'} style={{ display: 'flex', flexDirection: 'row' }}>
          <ArcoLayout.Sider
            collapsedWidth={isMobile ? 0 : 64}
            collapsed={collapsed}
            width={siderWidth}
            className={classNames('!bg-2 layout-sider', {
              collapsed: collapsed,
            })}
            style={siderStyle}
          >
            <ArcoLayout.Header
              className={classNames(
                'flex items-center justify-start py-10px px-16px pl-20px gap-12px layout-sider-header',
                isMobile && 'layout-sider-header--mobile',
                {
                  'cursor-pointer group ': collapsed,
                }
              )}
            >
              <div
                className={classNames('shrink-0 relative flex items-center justify-center', {
                  'size-40px': !collapsed,
                  'size-24px': collapsed,
                })}
                onClick={onClick}
              >
                <img
                  src='./brand-mark.png'
                  alt='1ONE Code'
                  style={{
                    height: collapsed ? '20px' : '28px',
                    width: 'auto',
                    objectFit: 'contain',
                    filter: 'brightness(1.1)',
                    transition: 'height 0.2s',
                  }}
                />
              </div>
              <div className='flex-1 text-20px text-1 collapsed-hidden font-bold'>1ONE Code</div>
              {isMobile && !collapsed && (
                <button
                  type='button'
                  className='app-titlebar__button'
                  onClick={() => setCollapsed(true)}
                  aria-label='Collapse sidebar'
                >
                  {collapsed ? (
                    <MenuUnfold theme='outline' size='18' fill='currentColor' />
                  ) : (
                    <MenuFold theme='outline' size='18' fill='currentColor' />
                  )}
                </button>
              )}
              {/* 侧栏折叠改由标题栏统一控制 / Sidebar folding handled by Titlebar toggle */}
            </ArcoLayout.Header>

            {/* 合并布局：左侧竖向图标列 + 右侧内容 */}
            <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {!isMobile && !collapsed && <SidebarNavIcons />}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <ArcoLayout.Content
                  className={classNames('p-8px layout-sider-content', !isMobile && 'h-full')}
                >
                  {React.isValidElement(sider)
                    ? React.cloneElement(sider, {
                        onSessionClick: () => {
                          cleanupSiderTooltips();
                          if (isMobile) setCollapsed(true);
                        },
                        collapsed,
                      } as any)
                    : sider}
                </ArcoLayout.Content>
              </div>
            </div>
            {!isMobile && (
              <div
                className='absolute top-0 h-full w-8px z-20 cursor-col-resize group'
                style={{ right: '-4px' }}
                onMouseDown={beginSiderResizeDrag}
                aria-hidden='true'
              >
                <div className='absolute top-0 left-1/2 h-full w-1px -translate-x-1/2 bg-transparent group-hover:bg-[var(--color-border-2)] transition-colors duration-150' />
              </div>
            )}
          </ArcoLayout.Sider>

          <ArcoLayout.Content
            className={'bg-1 layout-content flex flex-col min-h-0'}
            onClick={() => {
              if (isMobile && !collapsed) setCollapsed(true);
            }}
            style={
              isMobile
                ? {
                    width: '100%',
                  }
                : undefined
            }
          >
            <Outlet />
            {multiAgentContextHolder}
            {directorySelectionContextHolder}
            <PwaPullToRefresh />
            <Suspense fallback={null}>
              <UpdateModal />
            </Suspense>
          </ArcoLayout.Content>
        </ArcoLayout>
      </div>
    </LayoutContext.Provider>
  );
};

export default Layout;
