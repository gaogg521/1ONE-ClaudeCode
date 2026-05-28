/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type WorkspaceTeamMembership = {
  teamId: string;
  teamName: string;
  role: string;
};

export type WorkspaceUserProfile = {
  userId: string;
  username: string;
  email: string | null;
  role: string;
  tenantId: string;
  tenantName: string | null;
  joinedEnterprise: boolean;
  avatarUrl: string | null;
  orgUnitPath: string | null;
  teams: WorkspaceTeamMembership[];
  updatedAt: number;
};
