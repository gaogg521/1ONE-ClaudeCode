import { describe, expect, it } from 'vitest';
import { withFinishedDigitalEmployeeRun, withNewDigitalEmployeeRun } from '@/common/digitalEmployee/runPersistence';
import type { DigitalEmployeeRunRecord } from '@/common/types/digitalEmployeeRunTypes';

describe('digital employee run persistence', () => {
  it('prepends a new run record', () => {
    const next = withNewDigitalEmployeeRun(
      { runHistory: [] },
      {
        runId: 'r1',
        conversationId: 'c1',
        startedAt: 1,
        status: 'running',
      }
    );
    expect(next.lastRun?.runId).toBe('r1');
    expect(next.runHistory).toHaveLength(1);
  });

  it('finishes a running record by conversation id', () => {
    const running: DigitalEmployeeRunRecord = {
      runId: 'r1',
      conversationId: 'c1',
      startedAt: 1,
      status: 'running',
    };
    const next = withFinishedDigitalEmployeeRun(
      { lastRun: running, runHistory: [running] },
      { conversationId: 'c1' },
      { status: 'success', summary: 'done' }
    );
    expect(next.lastRun?.status).toBe('success');
    expect(next.lastRun?.summary).toBe('done');
    expect(next.runHistory?.[0]?.finishedAt).toBeTypeOf('number');
  });
});
