/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import path from 'path';
import { shouldAutoInitCodegraph } from '@process/services/agentToolkit/workspace';

describe('shouldAutoInitCodegraph', () => {
  const workDir = path.join('C:', 'Users', 'me', 'AppData', '1one', 'work');

  it('returns false for temp workspaces without custom flag', async () => {
    const temp = path.join(workDir, 'claude-temp-123456');
    await expect(shouldAutoInitCodegraph(temp, false)).resolves.toBe(false);
  });

  it('returns true for user project workspace', async () => {
    await expect(shouldAutoInitCodegraph('D:\\projects\\my-app', true)).resolves.toBe(true);
  });

  it('returns false for custom temp path under workDir', async () => {
    const temp = path.join(workDir, 'claude-temp-999');
    await expect(shouldAutoInitCodegraph(temp, true, workDir)).resolves.toBe(false);
  });
});
