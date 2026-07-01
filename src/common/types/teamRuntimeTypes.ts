/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type TeamRuntimeInstalledAgent = {
  backend: string;
  name: string;
  cliPath?: string;
};

export type TeamRuntimeNodeStatus = 'online' | 'offline';

/** Heartbeat record for a teammate machine visible within a tenant. */
export type TeamRuntimeNode = {
  id: string;
  tenantId: string;
  userId: string;
  machineId: string;
  displayName: string;
  hostnames: string[];
  ipAddresses: string[];
  installedAgents: TeamRuntimeInstalledAgent[];
  status: TeamRuntimeNodeStatus;
  /** False when the device reported without a signed-in user (pending auth). */
  authenticated: boolean;
  lastSeenAt: number;
  updatedAt: number;
};

export type UpsertTeamRuntimeNodeInput = {
  tenantId: string;
  userId: string;
  machineId: string;
  displayName: string;
  hostnames: string[];
  ipAddresses: string[];
  installedAgents: TeamRuntimeInstalledAgent[];
  authenticated?: boolean;
};

export type ListTeamRuntimeNodesInput = {
  tenantId: string;
  teamIds?: string[];
  includeOffline?: boolean;
  /** Include pending (not-yet-authenticated) devices — admin view only. */
  includePending?: boolean;
};
