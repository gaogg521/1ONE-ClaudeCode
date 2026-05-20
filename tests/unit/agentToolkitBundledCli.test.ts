/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  isCodegraphBundled,
  resolveCodegraphInvocation,
} from '@process/services/agentToolkit/bundledCli';

const hasBundledRuntime = existsSync(
  path.join(
    process.cwd(),
    'resources',
    'bundled-agent-toolkit',
    `${process.platform === 'win32' ? 'win32' : process.platform}-${process.arch}`,
    'node_modules',
    '@colbymchenry',
    'codegraph',
    'dist',
    'bin',
    'codegraph.js'
  )
);

describe('resolveCodegraphInvocation', () => {
  it('prefers bundled CLI when resources are present', () => {
    const inv = resolveCodegraphInvocation(['serve', '--mcp']);
    if (hasBundledRuntime) {
      expect(isCodegraphBundled()).toBe(true);
      expect(inv.source).toBe('bundled');
      expect(inv.args[0]).toContain('codegraph');
      expect(inv.args).toContain('serve');
      expect(inv.args).toContain('--mcp');
    } else {
      expect(inv.source).toBe('npx');
      expect(inv.args[0]).toBe('-y');
      expect(inv.args).toContain('serve');
    }
  });
});
