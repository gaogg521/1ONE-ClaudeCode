import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { AutopilotContext } from '@/common/types/autopilotContext';

export function readCronAutopilotContext(job: ICronJob): AutopilotContext | undefined {
  return job.metadata.agentConfig?.autopilotContext;
}

export function isAgentCronJob(job: ICronJob, teamId: string, slotId: string): boolean {
  const ctx = readCronAutopilotContext(job);
  return ctx?.teamId === teamId && ctx?.agentSlotId === slotId;
}

export function listAgentCronJobs(jobs: ICronJob[], teamId: string, slotId: string): ICronJob[] {
  return jobs.filter((job) => isAgentCronJob(job, teamId, slotId));
}

export function formatCronScheduleBrief(job: ICronJob): string {
  if (job.schedule.kind === 'cron' && !job.schedule.expr?.trim()) {
    return '手动触发';
  }
  return job.schedule.description || job.schedule.expr || '—';
}
