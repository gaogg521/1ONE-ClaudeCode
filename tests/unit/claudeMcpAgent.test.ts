/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { IMcpServer } from '../../src/common/config/storage';
import {
  buildClaudeStdioJsonConfig,
  isClaudeMcpServerAlreadyInstalled,
  normalizeClaudeStdioTransport,
} from '../../src/process/services/mcpServices/agents/ClaudeMcpAgent';

describe('ClaudeMcpAgent helpers', () => {
  it('builds stdio MCP JSON config including env vars', () => {
    const server: IMcpServer = {
      id: 'builtin-image-gen',
      name: '1one-claudecode-image-generation',
      enabled: true,
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['/abs/builtin-mcp-image-gen.js'],
        env: {
          ONE_IMG_PLATFORM: 'openai',
          ONE_IMG_MODEL: 'gpt-image-1',
        },
      },
      createdAt: 1,
      updatedAt: 1,
      originalJson: '{}',
    };

    expect(JSON.parse(buildClaudeStdioJsonConfig(server))).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['/abs/builtin-mcp-image-gen.js'],
      env: {
        ONE_IMG_PLATFORM: 'openai',
        ONE_IMG_MODEL: 'gpt-image-1',
      },
    });
  });

  it('treats Claude CLI already-exists output as a benign install skip', () => {
    const error = Object.assign(new Error('Command failed with exit code 1'), {
      stdout: 'MCP server one-image-generation already exists in user config\n',
      stderr: '',
      code: 1,
    });
    expect(isClaudeMcpServerAlreadyInstalled(error)).toBe(true);
  });

  it('wraps legacy script-path commands for Claude stdio JSON', () => {
    const scriptPath =
      'D:/app/resources/bundled-agent-toolkit/win32-x64/node_modules/@colbymchenry/codegraph/dist/bin/codegraph.js';
    const normalized = normalizeClaudeStdioTransport({
      type: 'stdio',
      command: scriptPath,
      args: ['serve', '--mcp'],
      env: {},
    });

    expect(normalized.command).not.toBe(scriptPath);
    expect(normalized.args[0]).toBe(scriptPath);
    expect(normalized.args.slice(1)).toEqual(['serve', '--mcp']);
  });
});
