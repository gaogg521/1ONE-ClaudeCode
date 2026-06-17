/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Location } from 'react-router-dom';
import { AGENT_FLEET_PATH } from '@/renderer/pages/agentFleet/agentFleetRouting';

export { AGENT_FLEET_PATH };

export const SUPER_ASSISTANT_TABS = ['overview', 'agents', 'issues', 'skills', 'settings'] as const;

/** Legacy super-assistant tab; fleet UI lives at {@link AGENT_FLEET_PATH}. */
export const LEGACY_SUPER_ASSISTANT_RUNTIMES_TAB = 'runtimes';

export type SuperAssistantTab = (typeof SUPER_ASSISTANT_TABS)[number];

const TAB_STORAGE_KEY = 'one-super-assistant-active-tab';

function isSuperAssistantTab(value: string | null): value is SuperAssistantTab {
  return value != null && (SUPER_ASSISTANT_TABS as readonly string[]).includes(value);
}

function readSearchFromHash(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const hash = window.location.hash.replace(/^#/, '');
  const queryIndex = hash.indexOf('?');
  return queryIndex >= 0 ? hash.slice(queryIndex) : '';
}

export function readSuperAssistantSearch(location: Pick<Location, 'search'>): string {
  if (location.search.includes('tab=') || location.search.includes('issueId=')) {
    return location.search;
  }
  const fromHash = readSearchFromHash();
  return fromHash || location.search;
}

export function parseSuperAssistantTab(search: string): SuperAssistantTab {
  const rawTab = new URLSearchParams(search).get('tab');
  if (rawTab === 'workspace' || rawTab === LEGACY_SUPER_ASSISTANT_RUNTIMES_TAB) {
    return 'overview';
  }
  return isSuperAssistantTab(rawTab) ? rawTab : 'overview';
}

export function shouldRedirectLegacyRuntimesTab(search: string): boolean {
  return new URLSearchParams(search).get('tab') === LEGACY_SUPER_ASSISTANT_RUNTIMES_TAB;
}

export function readSuperAssistantTabFromLocation(location: Pick<Location, 'search'>): SuperAssistantTab {
  return parseSuperAssistantTab(readSuperAssistantSearch(location));
}

export function readStoredSuperAssistantTab(): SuperAssistantTab | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  const stored = sessionStorage.getItem(TAB_STORAGE_KEY);
  return isSuperAssistantTab(stored) ? stored : null;
}

export function storeSuperAssistantTab(tab: SuperAssistantTab): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  sessionStorage.setItem(TAB_STORAGE_KEY, tab);
}

export function buildSuperAssistantPath(input: { tab: SuperAssistantTab; issueId?: string | null }): string {
  const params = new URLSearchParams();
  params.set('tab', input.tab);
  if (input.issueId) {
    params.set('issueId', input.issueId);
  }
  return `/super-assistant?${params.toString()}`;
}
