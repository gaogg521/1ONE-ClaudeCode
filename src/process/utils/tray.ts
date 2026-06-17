/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow, Tray as TrayInstance } from 'electron';
import {
  electronApp as app,
  electronBrowserWindow,
  electronMenu as Menu,
  electronNativeImage as nativeImage,
  electronTray as Tray,
} from '@/common/electronSafe';
import { showAndFocusMainWindow } from '@process/utils/mainWindowFocus';
import { mainLog } from '@process/utils/mainLogger';
import * as path from 'path';
import i18n from '@process/services/i18n';
import { workerTaskManager } from '../task/workerTaskManagerSingleton';
import { scheduleApplicationRestart } from './devRestart';

/** Stable RFC-4122 GUID for packaged Windows builds (unsigned dev must omit GUID). */
const WIN_TRAY_GUID = '6f1e9c2a-8b4d-41a1-a716-446655440001';

const WIN_TRAY_HOTKEY = 'CommandOrControl+Shift+O';

let tray: TrayInstance | null = null;
let trayContextMenu: Electron.Menu | null = null;
let closeToTrayEnabled = false;
let isQuitting = false;
let mainWindowRef: BrowserWindow | null = null;
let createMainWindowFn: (() => void) | null = null;
let trayHotkeyRegistered = false;

export const setTrayMainWindow = (win: BrowserWindow): void => {
  mainWindowRef = win;
};

/** Called from index.ts so tray can recreate the desktop window when it was never shown or was destroyed. */
export const setTrayCreateWindowHandler = (handler: () => void): void => {
  createMainWindowFn = handler;
};

const resolveMainWindowForTray = (): BrowserWindow | null => {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    return mainWindowRef;
  }
  if (!electronBrowserWindow) {
    return null;
  }
  const windows = electronBrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  const titled = windows.find((w) => w.getTitle().includes('1ONE') || w.getTitle().includes('1one'));
  return titled ?? windows[0] ?? null;
};

const showAndFocusMainWindowFromTray = (): void => {
  mainLog('[Tray]', 'showAndFocus requested');
  const win = resolveMainWindowForTray();
  if (win) {
    showAndFocusMainWindow(win);
    try {
      tray?.focus();
    } catch {
      // ignore
    }
    mainWindowRef = win;
    mainLog(
      '[Tray]',
      `focused window id=${win.id} visible=${win.isVisible()} title=${typeof win.getTitle === 'function' ? win.getTitle() : ''}`
    );
    return;
  }

  if (createMainWindowFn) {
    mainLog('[Tray]', 'No main window — recreating from tray click');
    createMainWindowFn();
  } else {
    mainLog('[Tray]', 'Cannot show window: no window and no create handler');
  }
};

const registerTrayGlobalShortcut = (): void => {
  if (process.platform !== 'win32' || trayHotkeyRegistered) {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { globalShortcut } = require('electron') as { globalShortcut: Electron.GlobalShortcut };
    globalShortcut.unregister(WIN_TRAY_HOTKEY);
    const ok = globalShortcut.register(WIN_TRAY_HOTKEY, () => {
      mainLog('[Tray]', `hotkey ${WIN_TRAY_HOTKEY}`);
      showAndFocusMainWindowFromTray();
    });
    trayHotkeyRegistered = ok;
    if (!ok) {
      mainLog('[Tray]', `failed to register hotkey ${WIN_TRAY_HOTKEY}`);
    }
  } catch (error) {
    mainLog('[Tray]', 'globalShortcut register error', error);
  }
};

const unregisterTrayGlobalShortcut = (): void => {
  if (!trayHotkeyRegistered) {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { globalShortcut } = require('electron') as { globalShortcut: Electron.GlobalShortcut };
    globalShortcut.unregister(WIN_TRAY_HOTKEY);
  } catch {
    // ignore
  }
  trayHotkeyRegistered = false;
};

const attachTrayContextMenu = (menu: Electron.Menu): void => {
  trayContextMenu = menu;
  if (!tray) {
    return;
  }
  // Windows: setContextMenu makes left-click open the menu and often eats double-click.
  if (process.platform === 'win32') {
    return;
  }
  tray.setContextMenu(menu);
};

const bindTrayInteractionHandlers = (): void => {
  if (!tray) {
    return;
  }

  if (process.platform === 'win32') {
    tray.on('click', () => {
      mainLog('[Tray]', 'left-click');
      showAndFocusMainWindowFromTray();
    });
    tray.on('double-click', () => {
      mainLog('[Tray]', 'double-click');
      showAndFocusMainWindowFromTray();
    });
    tray.on('right-click', () => {
      mainLog('[Tray]', 'right-click');
      if (trayContextMenu) {
        tray?.popUpContextMenu(trayContextMenu);
      }
    });
    tray.on('balloon-click', () => {
      showAndFocusMainWindowFromTray();
    });
    return;
  }

  tray.on('double-click', () => {
    showAndFocusMainWindowFromTray();
  });
  tray.on('click', () => {
    if (process.platform === 'linux') {
      showAndFocusMainWindowFromTray();
    }
  });
};

export const getCloseToTrayEnabled = (): boolean => closeToTrayEnabled;

export const setCloseToTrayEnabled = (enabled: boolean): void => {
  closeToTrayEnabled = enabled;
};

export const getIsQuitting = (): boolean => isQuitting;

export const setIsQuitting = (quitting: boolean): void => {
  isQuitting = quitting;
};

/**
 * Get tray icon.
 * macOS uses Template image to adapt to dark/light menu bar.
 */
const getTrayIcon = (): Electron.NativeImage => {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
  const iconName = process.platform === 'win32' ? 'app.ico' : 'app.png';
  const icon = nativeImage.createFromPath(path.join(resourcesPath, iconName));
  if (icon.isEmpty()) {
    console.warn(`[Tray] Failed to load tray icon ${iconName}, falling back to app.png`);
    const fallback = nativeImage.createFromPath(path.join(resourcesPath, 'app.png'));
    if (process.platform === 'darwin') {
      return fallback.resize({ width: 16, height: 16 });
    }
    return fallback.resize({ width: 32, height: 32 });
  }
  if (process.platform === 'darwin') {
    return icon.resize({ width: 16, height: 16 });
  }
  if (process.platform === 'win32') {
    return icon.resize({ width: 16, height: 16 });
  }
  return icon.resize({ width: 32, height: 32 });
};

/**
 * Build tray context menu (async to support dynamic content).
 */
const buildTrayContextMenu = async (): Promise<Electron.Menu> => {
  const getRecentConversations = async (): Promise<Array<{ id: string; title: string }>> => {
    try {
      const { getDatabase } = await import('@process/services/database');
      const db = await getDatabase();
      const result = db.getUserConversations(undefined, 0, 5);
      return (result.data || []).slice(0, 5).map((conv) => ({
        id: conv.id,
        title: conv.name || i18n.t('common.tray.untitled'),
      }));
    } catch {
      return [];
    }
  };

  const getRunningTasksCount = (): number => {
    try {
      return workerTaskManager.listTasks().length;
    } catch {
      return 0;
    }
  };

  const recentConversations = await getRecentConversations();
  const runningTasksCount = getRunningTasksCount();

  const showAndFocus = () => {
    showAndFocusMainWindowFromTray();
  };

  const hideToTray = () => {
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.hide();
      if (process.platform === 'darwin' && app.dock) {
        void app.dock.hide();
      }
    }
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: i18n.t('common.tray.showWindow'),
      click: showAndFocus,
    },
    {
      label: i18n.t('common.tray.closeToTray'),
      click: hideToTray,
    },
    { type: 'separator' },
    {
      label: i18n.t('common.tray.newChat'),
      click: () => {
        showAndFocus();
        mainWindowRef?.webContents.send('tray:navigate-to-guid');
      },
    },
  ];

  if (recentConversations.length > 0) {
    template.push({ type: 'separator' });
    template.push({
      label: i18n.t('common.tray.recentChats'),
      enabled: false,
    });
    for (const conv of recentConversations) {
      const displayTitle = conv.title.length > 20 ? conv.title.slice(0, 20) + '...' : conv.title;
      template.push({
        label: displayTitle,
        click: () => {
          showAndFocus();
          mainWindowRef?.webContents.send('tray:navigate-to-conversation', {
            conversationId: conv.id,
          });
        },
      });
    }
  }

  template.push({ type: 'separator' });
  template.push({
    label: `${i18n.t('common.tray.runningTasks')}: ${runningTasksCount}`,
    enabled: false,
  });
  template.push({
    label: i18n.t('common.tray.pauseAll'),
    click: () => {
      showAndFocus();
      mainWindowRef?.webContents.send('tray:pause-all-tasks');
    },
  });

  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.checkUpdate'),
    click: () => {
      showAndFocus();
      mainWindowRef?.webContents.send('tray:check-update');
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.about'),
    click: () => {
      showAndFocus();
      mainWindowRef?.webContents.send('tray:open-about');
    },
  });
  template.push({
    label: i18n.t('common.tray.restart'),
    click: () => {
      isQuitting = true;
      workerTaskManager.clear();
      scheduleApplicationRestart();
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.quit'),
    click: () => {
      isQuitting = true;
      app.quit();
    },
  });

  return Menu.buildFromTemplate(template);
};

const destroyTrayInstance = (): void => {
  unregisterTrayGlobalShortcut();
  trayContextMenu = null;
  if (tray) {
    try {
      tray.destroy();
    } catch {
      // ignore
    }
    tray = null;
  }
};

const createTrayInstance = (icon: Electron.NativeImage): void => {
  if (process.platform === 'win32') {
    try {
      tray = new Tray(icon, WIN_TRAY_GUID);
      return;
    } catch (guidError) {
      console.warn('[Tray] GUID tray failed (unsigned dev builds may ignore GUID):', guidError);
    }
  }
  tray = new Tray(icon);
};

/**
 * Create system tray. On Windows always recreates to avoid zombie notification icons.
 */
export const createOrUpdateTray = (): void => {
  const canReuse =
    process.platform !== 'win32' && tray && typeof tray.isDestroyed === 'function' && !tray.isDestroyed();
  if (canReuse) {
    void refreshTrayMenu();
    return;
  }

  destroyTrayInstance();
  try {
    const icon = getTrayIcon();
    createTrayInstance(icon);
    if (!tray) {
      return;
    }

    const tooltip = process.platform === 'win32' ? '1ONE — 左键/双击显示窗口，右键菜单，Ctrl+Shift+O' : '1one';
    tray.setToolTip(tooltip);

    bindTrayInteractionHandlers();
    if (process.platform === 'win32') {
      setTimeout(() => registerTrayGlobalShortcut(), 500);
    }
    void buildTrayContextMenu().then((menu) => attachTrayContextMenu(menu));

    const guid = typeof tray.getGUID === 'function' ? tray.getGUID() : null;
    console.log(
      `[Tray] created platform=${process.platform} packaged=${app.isPackaged} pid=${process.pid} guid=${guid ?? 'none'}`
    );
  } catch (err) {
    console.error('[Tray] Failed to create tray:', err);
  }
};

/**
 * Refresh tray context menu labels (called on language change).
 */
export const refreshTrayMenu = async (): Promise<void> => {
  if (!tray) {
    return;
  }
  const menu = await buildTrayContextMenu();
  attachTrayContextMenu(menu);
};

/**
 * Destroy system tray.
 */
export const destroyTray = (): void => {
  destroyTrayInstance();
};
