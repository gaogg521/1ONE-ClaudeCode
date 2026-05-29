/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';

export type OrgEditionAccessSettings = {
  editionSwitcherEnabled: boolean;
};

export async function fetchOrgEditionAccess(): Promise<OrgEditionAccessSettings> {
  try {
    const body = await fetchWebuiApiJson<{ success?: boolean; data?: OrgEditionAccessSettings }>(
      '/api/admin/org/edition-access'
    );
    if (body?.data) {
      return body.data;
    }
  } catch {
    // fall through
  }
  return { editionSwitcherEnabled: false };
}

export async function saveOrgEditionAccess(settings: OrgEditionAccessSettings): Promise<void> {
  await fetchWebuiApiJson('/api/admin/org/edition-access', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
