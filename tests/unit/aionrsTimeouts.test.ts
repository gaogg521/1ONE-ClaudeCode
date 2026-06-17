import { describe, expect, it } from 'vitest';
import { AIONRS_TIMEOUTS } from '@/process/agent/aionrs';

describe('AIONRS_TIMEOUTS', () => {
  it('uses 20s for first-token and post-tool stalls', () => {
    expect(AIONRS_TIMEOUTS.RESPONSE_STALL_MS).toBe(20_000);
    expect(AIONRS_TIMEOUTS.STALL_AFTER_TOOL_RESULT_MS).toBe(20_000);
    expect(AIONRS_TIMEOUTS.READY_MS).toBe(20_000);
  });

  it('keeps generous timeout while tools execute locally', () => {
    expect(AIONRS_TIMEOUTS.STALL_DURING_TOOL_MS).toBeGreaterThan(AIONRS_TIMEOUTS.RESPONSE_STALL_MS);
  });
});
