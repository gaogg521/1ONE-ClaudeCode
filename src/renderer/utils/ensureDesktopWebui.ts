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

  const status = await webui.getStatus.invoke();
  if (status.success && status.data?.running) {
    await syncBrowserWebuiSessionToDesktop();
    return;
  }

  const startResult = await webui.start.invoke({});
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
