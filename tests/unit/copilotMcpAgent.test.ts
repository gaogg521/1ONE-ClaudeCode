/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { CopilotMcpAgent } from '@process/services/mcpServices/agents/CopilotMcpAgent';

describe('CopilotMcpAgent', () => {
  it('exposes stdio and http transports', () => {
    const agent = new CopilotMcpAgent();
    expect(agent.getSupportedTransports()).toContain('stdio');
    expect(agent.getSupportedTransports()).toContain('http');
  });
});
