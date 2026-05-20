/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { getConfigPath } from '@process/utils/utils';

export const AGENT_TOOLKIT_DIR_NAME = 'agent-toolkit';

export const AGENT_BROWSER_INSTALL_FLAG = 'agent-browser-chrome-installed';

export const CODEGRAPH_MARKER_DIR = '.codegraph';

export const SUPERPOWERS_REPO = 'obra/superpowers';

export const SUPERPOWERS_SKILLS_SUBDIR = 'skills';

export const AGENT_BROWSER_NPX_PACKAGE = 'agent-browser';

export function getAgentToolkitDir(): string {
  return path.join(getConfigPath(), AGENT_TOOLKIT_DIR_NAME);
}

export function getAgentToolkitVendorBuiltinDir(): string {
  return path.join(getAgentToolkitDir(), 'vendored', '_builtin');
}

export function getAgentBrowserInstallFlagPath(): string {
  return path.join(getAgentToolkitDir(), AGENT_BROWSER_INSTALL_FLAG);
}
