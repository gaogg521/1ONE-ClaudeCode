import { describe, expect, it } from 'vitest';
import { AionrsAgent, AIONRS_TIMEOUTS } from '@/process/agent/aionrs/index';
import { formatAionrsProcessExitError } from '@/process/agent/aionrs/exitMessages';

describe('AionrsAgent exit handling', () => {
  it('uses 20s ready timeout constant', () => {
    expect(AIONRS_TIMEOUTS.READY_MS).toBe(20_000);
  });

  it('formatAionrsProcessExitError distinguishes exit 0 from auth failures', () => {
    expect(formatAionrsProcessExitError(0)).toContain('exit code 0');
    expect(formatAionrsProcessExitError(1)).toContain('API 认证失败');
  });

  it('exports AionrsAgent class for worker spawn', () => {
    expect(typeof AionrsAgent).toBe('function');
  });
});
