/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow, dialog } from 'electron';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { writeFile, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';
import { ipcBridge } from '@/common';
import { getEnhancedEnv } from '@process/utils/shellEnv';

const execFileAsync = promisify(execFile);

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

/**
 * Render HTML string to a PDF buffer via a hidden Chromium window.
 * Shared by htmlToPdf (direct) and officeToPdf (fallback after officecli→HTML).
 * Includes dynamic-content wait (fonts, network idle, canvas drawn) so JS-heavy
 * pages (Chart.js, etc.) finish rendering before we snapshot.
 */
async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
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
    await win.loadURL(dataUrl);
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      win.webContents
        .executeJavaScript(
          `
          (async () => {
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            try { await Promise.race([document.fonts.ready, sleep(1500)]); } catch {}
            const idle = (ms) => new Promise((resolve) => {
              let t;
              const reset = () => { clearTimeout(t); t = setTimeout(resolve, ms); };
              const obs = new PerformanceObserver((list) => {
                for (const e of list.getEntries()) {
                  if (e.entryType === 'resource') reset();
                }
              });
              try { obs.observe({ type: 'resource', buffered: true }); } catch {}
              reset();
            });
            await Promise.race([idle(500), sleep(4000)]);
            const canvasReady = async () => {
              const canvases = Array.from(document.querySelectorAll('canvas'));
              if (canvases.length === 0) return true;
              for (const c of canvases) {
                try {
                  const ctx = c.getContext('2d');
                  if (!ctx) continue;
                  const { width: w, height: h } = c;
                  if (w === 0 || h === 0) return false;
                  const data = ctx.getImageData(0, 0, w, h).data;
                  let drawn = 0;
                  for (let i = 3; i < data.length; i += 4) {
                    if (data[i] > 10) drawn++;
                    if (drawn > 50) break;
                  }
                  if (drawn <= 50) return false;
                } catch { return false; }
              }
              return true;
            };
            for (let i = 0; i < 40; i++) {
              if (await canvasReady()) break;
              await sleep(100);
            }
            await sleep(300);
            return true;
          })()
          `,
          true
        )
        .finally(() => finish());
      setTimeout(finish, 8000);
    });

    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margins: { marginType: 'none' },
    });
  } finally {
    win.destroy();
  }
}

async function showPdfSaveDialog(defaultName?: string): Promise<string | null> {
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
    return null;
  }
  return saveResult.filePath;
}

// ===== Office → PDF: platform-native (COM on Windows, soffice on mac/Linux) =====

let officeAvailabilityCache: { checked: boolean; hasNative: boolean; sofficePath?: string } = {
  checked: false,
  hasNative: false,
};

/**
 * Detect whether a native Office→PDF converter is available.
 * Windows: MS Office COM (Word.Application). mac/Linux: soffice (LibreOffice).
 * Result cached for the process lifetime — probing every export would be slow.
 */
async function detectNativeOfficeConverter(): Promise<{ hasNative: boolean; sofficePath?: string }> {
  if (officeAvailabilityCache.checked) {
    return officeAvailabilityCache;
  }
  if (process.platform === 'win32') {
    // Probe MS Office via Word.Application COM. Any of Word/Excel/PowerPoint
    // being present means the others usually are too (same suite).
    try {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'try { $w = New-Object -ComObject Word.Application; $w.Quit(); "ok" } catch { "fail" }',
      ], { timeout: 15000, env: getEnhancedEnv() });
      officeAvailabilityCache = { checked: true, hasNative: true };
    } catch {
      officeAvailabilityCache = { checked: true, hasNative: false };
    }
    return officeAvailabilityCache;
  }
  // mac / linux: look for soffice
  const candidates = process.platform === 'darwin'
    ? ['/Applications/LibreOffice.app/Contents/MacOS/soffice', '/usr/local/bin/soffice']
    : ['/usr/bin/soffice', '/usr/bin/libreoffice', '/snap/bin/libreoffice'];
  const found = candidates.find((p) => existsSync(p));
  officeAvailabilityCache = { checked: true, hasNative: !!found, sofficePath: found };
  return officeAvailabilityCache;
}

/**
 * Windows: convert via MS Office COM (PowerShell child process).
 * Word/Excel use ExportAsFixedFormat; PowerPoint uses SaveAs with format 32 (ppSaveAsPDF).
 */
async function convertViaWindowsCom(srcPath: string, pdfPath: string): Promise<void> {
  const ext = path.extname(srcPath).toLowerCase();
  const psScript = (() => {
    if (ext === '.docx' || ext === '.doc') {
      return `$w = New-Object -ComObject Word.Application; $w.Visible = $false; try { $d = $w.Documents.Open('${srcPath.replace(/'/g, "''")}'); $d.ExportAsFixedFormat('${pdfPath.replace(/'/g, "''")}', 17); $d.Close($false) } finally { $w.Quit() }`;
    }
    if (ext === '.xlsx' || ext === '.xls') {
      return `$e = New-Object -ComObject Excel.Application; $e.Visible = $false; $e.DisplayAlerts = $false; try { $b = $e.Workbooks.Open('${srcPath.replace(/'/g, "''")}'); $b.ExportAsFixedFormat(0, '${pdfPath.replace(/'/g, "''")}'); $b.Close($false) } finally { $e.Quit() }`;
    }
    if (ext === '.pptx' || ext === '.ppt') {
      return `$p = New-Object -ComObject PowerPoint.Application; try { $d = $p.Presentations.Open('${srcPath.replace(/'/g, "''")}', $true, $false, $false); $d.SaveAs('${pdfPath.replace(/'/g, "''")}', 32); $d.Close() } finally { $p.Quit() }`;
    }
    throw new Error(`Unsupported Office file type: ${ext}`);
  })();

  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    timeout: 120000,
    env: getEnhancedEnv(),
    windowsHide: true,
  });
}

/**
 * mac/Linux: convert via LibreOffice headless.
 */
async function convertViaSoffice(srcPath: string, pdfPath: string, sofficePath: string): Promise<void> {
  // soffice outputs to <outdir>/<basename>.pdf — rename to target after.
  const outDir = path.dirname(pdfPath);
  const expectedOut = path.join(outDir, path.basename(srcPath, path.extname(srcPath)) + '.pdf');
  await execFileAsync(sofficePath, ['--headless', '--convert-to', 'pdf', '--outdir', outDir, srcPath], {
    timeout: 120000,
    env: getEnhancedEnv(),
  });
  if (expectedOut !== pdfPath) {
    const { rename } = await import('fs/promises');
    await rename(expectedOut, pdfPath);
  }
}

/**
 * Fallback: officecli view <file> html → Chromium printToPDF.
 * Lower fidelity (HTML pagination, not Office's), but works without Office installed.
 */
async function convertViaOfficecliHtml(srcPath: string, pdfPath: string): Promise<void> {
  const { stdout } = await execFileAsync('officecli', ['view', srcPath, 'html'], {
    timeout: 60000,
    env: getEnhancedEnv(),
    maxBuffer: 50 * 1024 * 1024,
  });
  const pdfBuffer = await renderHtmlToPdfBuffer(stdout);
  await writeFile(pdfPath, pdfBuffer);
}

export function initExportBridge(): void {
  ipcBridge.exportApi.htmlToPdf.provider(async ({ html, defaultName }) => {
    const savePath = await showPdfSaveDialog(defaultName);
    if (!savePath) {
      return { success: false };
    }
    try {
      const pdfBuffer = await renderHtmlToPdfBuffer(html);
      await writeFile(savePath, pdfBuffer);
      return { success: true, filePath: savePath };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcBridge.exportApi.officeToPdf.provider(async ({ filePath, defaultName }) => {
    if (!filePath || !existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    const baseName = (defaultName ?? path.basename(filePath, path.extname(filePath))).replace(/\.(docx|xlsx|pptx|doc|xls|ppt)$/i, '');
    const savePath = await showPdfSaveDialog(`${baseName}.pdf`);
    if (!savePath) {
      return { success: false };
    }

    try {
      const { hasNative, sofficePath } = await detectNativeOfficeConverter();
      if (hasNative) {
        if (process.platform === 'win32') {
          await convertViaWindowsCom(filePath, savePath);
        } else if (sofficePath) {
          await convertViaSoffice(filePath, savePath, sofficePath);
        }
      } else {
        // No native converter — fallback to officecli view html → printToPDF.
        await convertViaOfficecliHtml(filePath, savePath);
      }
      return { success: true, filePath: savePath };
    } catch (e) {
      // If native conversion fails, try the fallback before giving up.
      try {
        await convertViaOfficecliHtml(filePath, savePath);
        return { success: true, filePath: savePath };
      } catch (e2) {
        return { success: false, error: e2 instanceof Error ? e2.message : String(e2) };
      }
    }
  });
}
