/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow, dialog } from 'electron';
import { writeFile } from 'fs/promises';
import { ipcBridge } from '@/common';

export function initExportBridge(): void {
  ipcBridge.exportApi.htmlToPdf.provider(async ({ html, defaultName }) => {
    const parentWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

    const saveResult = parentWindow
      ? await dialog.showSaveDialog(parentWindow, {
          defaultPath: defaultName ?? 'document',
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        })
      : await dialog.showSaveDialog({
          defaultPath: defaultName ?? 'document',
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false };
    }

    const win = new BrowserWindow({ show: false, webPreferences: { javascript: true } });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
      await writeFile(saveResult.filePath, pdfBuffer);
      return { success: true, filePath: saveResult.filePath };
    } finally {
      win.destroy();
    }
  });
}
