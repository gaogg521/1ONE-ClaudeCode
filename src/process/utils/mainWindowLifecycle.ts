/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { setApplicationMainWindow } from '../bridge/applicationBridge';
import { setDeepLinkMainWindow } from './deepLink';
import { showAndFocusMainWindow } from './mainWindowFocus';
import { setTrayMainWindow } from './tray';

export const bindMainWindowReferences = (window: BrowserWindow): void => {
  setTrayMainWindow(window);
  setDeepLinkMainWindow(window);
  setApplicationMainWindow(window);
};

export { showAndFocusMainWindow } from './mainWindowFocus';

export const showOrCreateMainWindow = ({
  mainWindow,
  createWindow,
}: {
  mainWindow: BrowserWindow | null | undefined;
  createWindow: () => void;
}): void => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showAndFocusMainWindow(mainWindow);
    return;
  }

  createWindow();
};
