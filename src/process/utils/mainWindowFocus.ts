/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { electronApp as app } from '@/common/electronSafe';

/** Restore, show, and focus the main window (Windows needs extra steps when hidden to tray). */
export const showAndFocusMainWindow = (window: BrowserWindow): void => {
  if (process.platform === 'darwin' && app?.dock) {
    void app.dock.show();
  }
  if (typeof app?.focus === 'function') {
    app.focus({ steal: true });
  }
  if (window.isMinimized()) {
    window.restore();
  }
  if (process.platform === 'win32') {
    window.setSkipTaskbar(false);
    if (!window.isVisible()) {
      window.show();
    }
    window.setAlwaysOnTop(true, 'screen-saver');
    window.focus();
    window.setAlwaysOnTop(false);
    return;
  }
  window.show();
  window.focus();
};
