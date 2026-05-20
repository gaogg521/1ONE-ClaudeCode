/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { formatAcpUnexpectedExitMessage } from '@/process/agent/acp/AcpConnection';

describe('formatAcpUnexpectedExitMessage', () => {
  it('returns a Windows-friendly message for abnormal exit codes', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });
    const msg = formatAcpUnexpectedExitMessage(1073807364, null);
    expect(msg).toContain('ACP 子进程异常退出');
    expect(msg).toContain('1073807364');
    vi.unstubAllGlobals();
  });

  it('returns generic message on non-Windows platforms', () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    const msg = formatAcpUnexpectedExitMessage(1, null);
    expect(msg).toBe('ACP process exited unexpectedly (code: 1, signal: null)');
    vi.unstubAllGlobals();
  });
});
