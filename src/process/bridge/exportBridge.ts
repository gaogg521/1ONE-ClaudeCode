/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow, dialog } from 'electron';
import { writeFile } from 'fs/promises';
import { ipcBridge } from '@/common';

/**
 * Wrap bare HTML fragments so Chromium renders them in standards mode and
 * applies a sane default font for CJK content. Full HTML documents are
 * passed through unchanged.
 */
function normalizeHtmlForPdf(html: string): string {
  const trimmed = html.trim();
  const hasDoctype = /<!doctype\s+html/i.test(trimmed);
  const hasHtmlTag = /<html[\s>]/i.test(trimmed);
  if (hasDoctype && hasHtmlTag) {
    return html;
  }
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif;
    color: #000;
    background: #fff;
  }
  @page { margin: 12mm; }
</style>
</head>
<body>
${html}
</body>
</html>`;
}

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

    const normalizedHtml = normalizeHtmlForPdf(html);
    // base64 avoids encodeURIComponent length/encoding pitfalls for large HTML
    const dataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(normalizedHtml, 'utf-8').toString('base64')}`;

    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        javascript: true,
        images: true,
        webgl: false,
        sandbox: false,
      },
    });

    try {
      // Wait for the page (and its synchronous subresources) to finish loading.
      await win.loadURL(dataUrl);

      // Give async resources (web fonts, CDN CSS, images) a moment to settle
      // before we snapshot the rendered tree to PDF. printToPDF does not wait
      // for `document.fonts.ready` on its own.
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (!settled) {
            settled = true;
            resolve();
          }
        };
        // Try to wait for fonts; fall back to a hard timeout either way.
        win.webContents.executeJavaScript(
          `Promise.race([
            document.fonts ? document.fonts.ready : Promise.resolve(),
            new Promise((r) => setTimeout(r, 1500))
          ]).then(() => true)`,
          true
        ).finally(() => finish());
        setTimeout(finish, 2000);
      });

      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        margins: { marginType: 'none' },
      });
      await writeFile(saveResult.filePath, pdfBuffer);
      return { success: true, filePath: saveResult.filePath };
    } finally {
      win.destroy();
    }
  });
}
