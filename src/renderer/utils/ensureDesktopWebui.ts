/**
 * Ensure the local WebUI HTTP server is running (Electron desktop only).
 * Personal-edition Issues and several enterprise APIs require it.
 */

import { webui } from '@/common/adapter/ipcBridge';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { syncBrowserWebuiSessionToDesktop } from '@/renderer/utils/syncBrowserWebuiSession';

const START_PROBE_ATTEMPTS = 12;
const START_PROBE_INTERVAL_MS = 250;

export async function ensureDesktopWebuiRunning(): Promise<void> {
  if (!isElectronDesktop()) {
    return;
  }

  // TEMP DIAGNOSTIC (2026-07-04): renderer console is always safe (no bridge patch).
  // Remove once the ~8s Issue-create delay is root-caused.
  const t0 = Date.now();
  const status = await webui.getStatus.invoke();
  console.log(`[ensure-diag] getStatus: ${Date.now() - t0}ms, running=${status.success && status.data?.running}`);
  if (status.success && status.data?.running) {
    const t1 = Date.now();
    await syncBrowserWebuiSessionToDesktop();
    console.log(`[ensure-diag] syncBrowserWebuiSessionToDesktop: ${Date.now() - t1}ms`);
    return;
  }

  const t2 = Date.now();
  const startResult = await webui.start.invoke({});
  console.log(`[ensure-diag] start: ${Date.now() - t2}ms, success=${startResult.success}`);
  if (!startResult.success) {
    throw new Error('WEBUI_NOT_RUNNING');
  }

  for (let attempt = 0; attempt < START_PROBE_ATTEMPTS; attempt += 1) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, START_PROBE_INTERVAL_MS);
    });
    const probe = await webui.getStatus.invoke();
    if (probe.success && probe.data?.running) {
      await syncBrowserWebuiSessionToDesktop();
      return;
    }
  }

  throw new Error('WEBUI_NOT_RUNNING');
}
