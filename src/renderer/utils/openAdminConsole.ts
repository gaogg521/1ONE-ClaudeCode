/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop } from '@/renderer/utils/platform';

export type OpenAdminConsoleResult = 'opened' | 'webui_not_running' | 'failed' | 'navigated';

type OpenAdminConsoleOptions = {
  navigate: (path: string) => void;
  openEnterpriseAdminInBrowser: () => Promise<'opened' | 'webui_not_running' | 'failed'>;
};

/** Open enterprise admin console: external browser on desktop, in-app route on WebUI. */
export async function openAdminConsole(options: OpenAdminConsoleOptions): Promise<OpenAdminConsoleResult> {
  if (isElectronDesktop()) {
    const result = await options.openEnterpriseAdminInBrowser();
    if (result === 'webui_not_running') {
      options.navigate('/settings/webui');
      return 'webui_not_running';
    }
    return result;
  }
  options.navigate('/enterprise/auth');
  return 'navigated';
}
