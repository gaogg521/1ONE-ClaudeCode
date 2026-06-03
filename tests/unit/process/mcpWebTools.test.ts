import { describe, expect, it } from 'vitest';
import { buildOneWebToolsAcpSessionMcpServer } from '@/process/agent/acp/mcpSessionConfig';
import { BUILTIN_WEB_TOOLS_NAME } from '@/process/resources/builtinMcp/constants';

describe('buildOneWebToolsAcpSessionMcpServer', () => {
  it('returns stdio MCP config for the web tools bundle', () => {
    const server = buildOneWebToolsAcpSessionMcpServer('/app/builtin-mcp-web-tools.js');
    expect(server.name).toBe(BUILTIN_WEB_TOOLS_NAME);
    expect(server.command).toBe('node');
    expect(server.args).toEqual(['/app/builtin-mcp-web-tools.js']);
  });
});
