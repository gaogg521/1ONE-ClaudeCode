/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { listAgentCronJobs } from './agentAutomationUtils';

export async function removeCronJobsForDigitalEmployee(teamId: string, slotId: string): Promise<number> {
  const jobs = await ipcBridge.cron.listJobs.invoke();
  const linked = listAgentCronJobs(jobs ?? [], teamId, slotId);
  await Promise.all(linked.map((job) => ipcBridge.cron.removeJob.invoke({ jobId: job.id })));
  return linked.length;
}

export async function deletePersonalDigitalEmployee(input: {
  id: string;
  ownerUserId: string;
}): Promise<{ removedCronJobs: number }> {
  const removedCronJobs = await removeCronJobsForDigitalEmployee('personal', input.id);
  await ipcBridge.personalAgent.remove.invoke({
    id: input.id,
    ownerUserId: input.ownerUserId,
  });
  return { removedCronJobs };
}

export async function deleteTeamDigitalEmployee(input: {
  teamId: string;
  tenantId?: string;
  slotId: string;
}): Promise<{ removedCronJobs: number }> {
  const removedCronJobs = await removeCronJobsForDigitalEmployee(input.teamId, input.slotId);
  await ipcBridge.team.removeAgent.invoke({
    teamId: input.teamId,
    tenantId: input.tenantId,
    slotId: input.slotId,
  });
  return { removedCronJobs };
}
