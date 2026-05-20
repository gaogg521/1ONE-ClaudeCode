/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { getPlatformServices } from '@/common/platform';
import { hasElectronAppPath } from '@process/utils/utils';
import { getEnhancedEnv, resolveNpxPath } from '@process/utils/shellEnv';
import { BUILTIN_CODEGRAPH_PACKAGE } from '@process/resources/builtinMcp/constants';
import { AGENT_BROWSER_NPX_PACKAGE } from './constants';

export type CliInvocationSource = 'bundled' | 'npx';

export type CliInvocation = {
  command: string;
  args: string[];
  env: Record<string, string>;
  source: CliInvocationSource;
};

type BundledManifest = {
  packages?: Record<
    string,
    {
      version?: string;
      cli?: string;
    }
  >;
};

const CODEGRAPH_CLI_REL = 'node_modules/@colbymchenry/codegraph/dist/bin/codegraph.js';
const AGENT_BROWSER_CLI_REL = 'node_modules/agent-browser/bin/agent-browser.js';

function getRuntimeKey(): string {
  const platform = process.platform === 'win32' ? 'win32' : process.platform;
  return `${platform}-${process.arch}`;
}

/**
 * Directory containing vendored npm packages (resources/bundled-agent-toolkit/{platform-arch}/).
 */
export function getBundledAgentToolkitRuntimeDir(): string | null {
  const runtimeKey = getRuntimeKey();
  const resourcesPath = getPlatformServices().paths.isPackaged()
    ? process.resourcesPath
    : path.join(process.cwd(), 'resources');
  const runtimeDir = path.join(resourcesPath, 'bundled-agent-toolkit', runtimeKey);
  return existsSync(runtimeDir) ? runtimeDir : null;
}

function readBundledCliPath(runtimeDir: string, relativeCli: string): string | null {
  const cliPath = path.join(runtimeDir, relativeCli);
  return existsSync(cliPath) ? cliPath : null;
}

function getNodeRunner(): { command: string; baseEnv: Record<string, string> } {
  if (hasElectronAppPath()) {
    return {
      command: process.execPath,
      baseEnv: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  const env = getEnhancedEnv();
  const npxPath = resolveNpxPath(env);
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  const nodePath = path.join(path.dirname(npxPath), nodeName);
  if (existsSync(nodePath)) {
    return { command: nodePath, baseEnv: {} };
  }

  return { command: 'node', baseEnv: {} };
}

function buildBundledInvocation(cliPath: string, cliArgs: string[]): CliInvocation {
  const runner = getNodeRunner();
  const env = { ...getEnhancedEnv(), ...runner.baseEnv };
  return {
    command: runner.command,
    args: [cliPath, ...cliArgs],
    env,
    source: 'bundled',
  };
}

function buildNpxInvocation(packageName: string, cliArgs: string[]): CliInvocation {
  const env = getEnhancedEnv();
  return {
    command: resolveNpxPath(env),
    args: ['-y', packageName, ...cliArgs],
    env,
    source: 'npx',
  };
}

export function resolveCodegraphInvocation(cliArgs: string[]): CliInvocation {
  const runtimeDir = getBundledAgentToolkitRuntimeDir();
  if (runtimeDir) {
    const cliPath = readBundledCliPath(runtimeDir, CODEGRAPH_CLI_REL);
    if (cliPath) {
      return buildBundledInvocation(cliPath, cliArgs);
    }
  }
  return buildNpxInvocation(BUILTIN_CODEGRAPH_PACKAGE, cliArgs);
}

export function resolveAgentBrowserInvocation(cliArgs: string[]): CliInvocation {
  const runtimeDir = getBundledAgentToolkitRuntimeDir();
  if (runtimeDir) {
    const cliPath = readBundledCliPath(runtimeDir, AGENT_BROWSER_CLI_REL);
    if (cliPath) {
      return buildBundledInvocation(cliPath, cliArgs);
    }
  }
  return buildNpxInvocation(AGENT_BROWSER_NPX_PACKAGE, cliArgs);
}

export function isCodegraphBundled(): boolean {
  const runtimeDir = getBundledAgentToolkitRuntimeDir();
  if (!runtimeDir) return false;
  return readBundledCliPath(runtimeDir, CODEGRAPH_CLI_REL) !== null;
}

export function readBundledAgentToolkitManifest(): BundledManifest | null {
  const runtimeDir = getBundledAgentToolkitRuntimeDir();
  if (!runtimeDir) return null;
  try {
    const manifestPath = path.join(runtimeDir, 'manifest.json');
    if (!existsSync(manifestPath)) return null;
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as BundledManifest;
  } catch {
    return null;
  }
}
