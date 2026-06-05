/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { webui } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import {
  ENTERPRISE_API_ORIGINS_KEY,
  mergeEnterpriseApiOrigins,
  normalizeEnterpriseApiOrigin,
} from '@/common/config/enterpriseApiOrigins';
import { isElectronDesktop } from '@/renderer/utils/platform';

export async function rememberEnterpriseApiOrigin(originOrUrl: string): Promise<void> {
  const origin = normalizeEnterpriseApiOrigin(originOrUrl);
  if (!origin) {
    return;
  }
  const stored = (await ConfigStorage.get(ENTERPRISE_API_ORIGINS_KEY).catch(() => [])) as string[] | undefined;
  const next = mergeEnterpriseApiOrigins(stored, [origin]);
  if (next.length === (stored?.length ?? 0) && stored?.includes(origin)) {
    return;
  }
  await ConfigStorage.set(ENTERPRISE_API_ORIGINS_KEY, next).catch(() => undefined);
  if (isElectronDesktop()) {
    await webui.setEnterpriseApiOrigins.invoke({ origins: next }).catch(() => undefined);
  }
}

export async function readEnterpriseApiOrigins(): Promise<string[]> {
  const stored = (await ConfigStorage.get(ENTERPRISE_API_ORIGINS_KEY).catch(() => [])) as string[] | undefined;
  return mergeEnterpriseApiOrigins(stored, []);
}
