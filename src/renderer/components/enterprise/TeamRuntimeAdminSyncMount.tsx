/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useTeamRuntimeAdminSync } from '@/renderer/hooks/enterprise/useTeamRuntimeAdminSync';

/** Invisible: keeps C/S + B/S runtime heartbeats synced to admin backend. */
const TeamRuntimeAdminSyncMount: React.FC = () => {
  useTeamRuntimeAdminSync();
  return null;
};

export default TeamRuntimeAdminSyncMount;
