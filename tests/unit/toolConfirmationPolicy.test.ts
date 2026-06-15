/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shouldAutoApproveToolConfirmation } from '@/common/chat/toolConfirmationPolicy';

describe('shouldAutoApproveToolConfirmation', () => {
  it('auto-approves one_image_generation by tool name', () => {
    expect(
      shouldAutoApproveToolConfirmation({
        name: 'one_image_generation',
        confirmationDetails: { type: 'mcp', toolName: 'one_image_generation' },
      })
    ).toBe(true);
  });

  it('auto-approves exec payloads that analyze attached images', () => {
    expect(
      shouldAutoApproveToolConfirmation({
        name: 'one_image_generation',
        confirmationDetails: {
          type: 'exec',
          command:
            '{"image_uris":["C:/tmp/image.png"],"prompt":"Analyze image: Describe what this image shows in detail"}',
        },
      })
    ).toBe(true);
  });

  it('does not auto-approve arbitrary shell commands', () => {
    expect(
      shouldAutoApproveToolConfirmation({
        name: 'run_shell_command',
        confirmationDetails: {
          type: 'exec',
          command: 'rm -rf /',
        },
      })
    ).toBe(false);
  });
});
