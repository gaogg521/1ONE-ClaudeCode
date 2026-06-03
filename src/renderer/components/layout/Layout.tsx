/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import PwaPullToRefresh from '@/renderer/components/layout/PwaPullToRefresh';
import Titlebar from '@/renderer/components/layout/Titlebar';
import { Layout as ArcoLayout } from '@arco-design/web-react';
import { MenuFold, MenuUnfold } from '@icon-park/react';
import classNames from 'classnames';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutContext } from '@renderer/hooks/context/LayoutContext';
import { useDeepLink } from '@renderer/hooks/system/useDeepLink';
import { useNotificationClick } from '@renderer/hooks/system/useNotificationClick';
import { useDirectorySelection } from '@renderer/hooks/file/useDirectorySelection';
import { useMultiAgentDetection } from '@renderer/hooks/agent/useMultiAgentDetection';
import { cleanupSiderTooltips } from '@renderer/utils/ui/siderTooltip';
import { useConversationShortcuts } from '@renderer/hooks/ui/useConversationShortcuts';
import { isElectronDesktop } from '@renderer/utils/platform';
import EditionRouteGuard from '@/renderer/components/layout/EditionRouteGuard';
import TeamRuntimeAdminSyncMount from '@/renderer/components/enterprise/TeamRuntimeAdminSyncMount';
import EditionWorkspaceGuide from '@/renderer/components/layout/EditionWorkspaceGuide';
import '@renderer/styles/layout.css';

export { getSidebarNavItems, type NavItem } from '@/renderer/components/layout/sidebarNav';

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

const UpdateModal = React.lazy(() => import('@/renderer/components/settings/UpdateModal'));

const DESKTOP_SIDER_WIDTH_RATIO = 0.2;
const DESKTOP_SIDER_MIN_WIDTH = 200;
const DESKTOP_COLLAPSED_WIDTH = 64;
const SIDER_DRAG_HYSTERESIS = 6;
const SIDER_WIDTH_STORAGE_KEY = '1one:sider-width';
const MOBILE_SIDER_WIDTH_RATIO = 0.67;
const MOBILE_SIDER_MIN_WIDTH = 260;
const MOBILE_SIDER_MAX_WIDTH = 420;

const getDesktopSiderMaxWidth = (viewportWidth: number): number =>
  Math.max(DESKTOP_SIDER_MIN_WIDTH, Math.min(360, Math.round(viewportWidth * 0.38)));

const getDesktopSiderDefaultWidth = (viewportWidth: number): number =>
  Math.max(
    DESKTOP_SIDER_MIN_WIDTH,
    Math.min(getDesktopSiderMaxWidth(viewportWidth), Math.round(viewportWidth * DESKTOP_SIDER_WIDTH_RATIO))
  );

const clampDesktopSiderWidth = (width: number, viewportWidth: number): number =>
  Math.max(DESKTOP_SIDER_MIN_WIDTH, Math.min(getDesktopSiderMaxWidth(viewportWidth), Math.round(width)));

const readStoredSiderWidth = (): number | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(SIDER_WIDTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
};

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
  const [desktopSiderWidth, setDesktopSiderWidth] = useState<number>(() => {
    const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const stored = readStoredSiderWidth();
    if (stored !== null) {
      return clampDesktopSiderWidth(stored, vw);
    }
    return getDesktopSiderDefaultWidth(vw);
  });
  const [isSiderDragging, setIsSiderDragging] = useState(false);
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
  const desktopSiderWidthRef = useRef(desktopSiderWidth);
  const dragStateRef = useRef<{ active: boolean; startX: number; startWidth: number }>({
    active: false,
    startX: 0,
    startWidth: getDesktopSiderDefaultWidth(typeof window === 'undefined' ? 1280 : window.innerWidth),
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

  useEffect(() => {
    if (isMobile) {
      return;
    }
    setDesktopSiderWidth((prev) => clampDesktopSiderWidth(prev, viewportWidth));
  }, [isMobile, viewportWidth]);

  // 清理侧栏 Tooltip 残留节点，避免移动端路由切换后浮层卡在左上角
  useEffect(() => {
    cleanupSiderTooltips();
  }, [isMobile, collapsed, location.pathname, location.search, location.hash]);

  // Bridge Main Process logs to F12 Console (desktop only)
  useEffect(() => {
    if (!isElectronDesktop()) {
      return;
    }
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
    : desktopSiderWidth;
  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  useEffect(() => {
    desktopSiderWidthRef.current = desktopSiderWidth;
  }, [desktopSiderWidth]);

  const beginSiderResizeDrag = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isMobile) return;
      event.preventDefault();
      dragStateRef.current = {
        active: true,
        startX: event.clientX,
        startWidth: collapsedRef.current ? DESKTOP_COLLAPSED_WIDTH : desktopSiderWidth,
      };
      setIsSiderDragging(true);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [desktopSiderWidth, isMobile]
  );

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState.active) return;

      const draggedWidth = dragState.startWidth + (event.clientX - dragState.startX);
      const snapThreshold = Math.round((DESKTOP_SIDER_MIN_WIDTH + DESKTOP_COLLAPSED_WIDTH) / 2);

      if (draggedWidth <= snapThreshold - SIDER_DRAG_HYSTERESIS) {
        if (!collapsedRef.current) {
          setCollapsed(true);
        }
        return;
      }

      if (collapsedRef.current && draggedWidth > snapThreshold + SIDER_DRAG_HYSTERESIS) {
        setCollapsed(false);
      }

      const nextWidth = clampDesktopSiderWidth(draggedWidth, window.innerWidth);
      desktopSiderWidthRef.current = nextWidth;
      setDesktopSiderWidth(nextWidth);
    };

    const endDrag = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      setIsSiderDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(SIDER_WIDTH_STORAGE_KEY, String(desktopSiderWidthRef.current));
      } catch {
        // ignore
      }
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
              'layout-sider--dragging': isSiderDragging,
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

            <ArcoLayout.Content className={classNames('p-8px layout-sider-content flex flex-col min-h-0', !isMobile && 'h-full')}>
              {React.isValidElement(sider)
                ? React.cloneElement(sider, {
                    onSessionClick: () => {
                      cleanupSiderTooltips();
                      if (isMobile) setCollapsed(true);
                    },
                    collapsed,
                  } as React.Attributes & { onSessionClick?: () => void; collapsed?: boolean })
                : sider}
            </ArcoLayout.Content>
            {!isMobile && (
              <div
                className='absolute top-0 h-full w-10px z-30 cursor-col-resize group'
                style={{ right: '-5px' }}
                onMouseDown={beginSiderResizeDrag}
                aria-hidden='true'
              >
                <div className='absolute top-0 left-1/2 h-full w-2px -translate-x-1/2 bg-transparent group-hover:bg-[var(--color-border-2)] group-active:bg-[rgb(var(--primary-6))] transition-colors duration-150' />
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
            <TeamRuntimeAdminSyncMount />
            <EditionRouteGuard />
            <EditionWorkspaceGuide />
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
