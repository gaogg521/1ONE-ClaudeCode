/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

// Keep this constant local to avoid pulling in common/config/storage side effects
// when the built-in MCP server boots in a standalone stdio process.
export const BUILTIN_IMAGE_GEN_ID = 'builtin-image-gen';
export const BUILTIN_IMAGE_GEN_NAME = 'one-image-generation';
export const BUILTIN_IMAGE_GEN_LEGACY_NAMES = ['1ONE ClaudeCode Image Generation', BUILTIN_IMAGE_GEN_ID] as const;

export const BUILTIN_CODEGRAPH_ID = 'builtin-codegraph';
export const BUILTIN_CODEGRAPH_NAME = 'codegraph';
export const BUILTIN_CODEGRAPH_PACKAGE = '@colbymchenry/codegraph';

export function isBuiltinImageGenName(name?: string | null): boolean {
  if (!name) return false;
  return (
    name === BUILTIN_IMAGE_GEN_NAME ||
    BUILTIN_IMAGE_GEN_LEGACY_NAMES.includes(name as (typeof BUILTIN_IMAGE_GEN_LEGACY_NAMES)[number])
  );
}

export function isBuiltinImageGenTransport(transport?: {
  type?: string;
  command?: string;
  args?: string[] | null;
}): boolean {
  if (!transport || transport.type !== 'stdio' || transport.command !== 'node') {
    return false;
  }

  return (transport.args || []).some((arg) => typeof arg === 'string' && arg.includes('builtin-mcp-image-gen.js'));
}

export function isBuiltinCodegraphName(name?: string | null): boolean {
  if (!name) return false;
  return name === BUILTIN_CODEGRAPH_NAME || name === BUILTIN_CODEGRAPH_ID;
}

export function isBuiltinCodegraphTransport(transport?: {
  type?: string;
  command?: string;
  args?: string[] | null;
}): boolean {
  if (!transport || transport.type !== 'stdio') {
    return false;
  }
  const args = transport.args || [];
  return args.some((arg) => typeof arg === 'string' && arg.includes(BUILTIN_CODEGRAPH_PACKAGE));
}
