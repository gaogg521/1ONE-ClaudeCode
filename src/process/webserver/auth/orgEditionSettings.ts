/**
 * Instance-wide org edition visibility (stored on auth_providers.local).
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProviderRepository } from './repository/AuthProviderRepository';

export type OrgEditionSettings = {
  /** When false, non–system_admin users cannot switch to enterprise edition in the titlebar. */
  editionSwitcherEnabled: boolean;
};

const DEFAULT_ORG_EDITION_SETTINGS: OrgEditionSettings = {
  editionSwitcherEnabled: false,
};

function parseSettings(config: Record<string, unknown>): OrgEditionSettings {
  const raw = config.editionSwitcherEnabled;
  if (typeof raw === 'boolean') {
    return { editionSwitcherEnabled: raw };
  }
  return { ...DEFAULT_ORG_EDITION_SETTINGS };
}

export async function getOrgEditionSettings(): Promise<OrgEditionSettings> {
  const row = await AuthProviderRepository.getProvider('local');
  if (!row) {
    return { ...DEFAULT_ORG_EDITION_SETTINGS };
  }
  const fromConfig = parseSettings(row.config);
  if (typeof row.config.editionSwitcherEnabled === 'boolean') {
    return fromConfig;
  }
  return {
    editionSwitcherEnabled: row.enabled,
  };
}

export async function setOrgEditionSettings(next: OrgEditionSettings): Promise<void> {
  const existing = await AuthProviderRepository.getProvider('local');
  const config = {
    ...(existing?.config ?? {}),
    editionSwitcherEnabled: next.editionSwitcherEnabled,
  };
  await AuthProviderRepository.setProvider('local', next.editionSwitcherEnabled, config);
}
