/**
 * Packaged app process name (electron-builder executableName).
 * Dev mode still runs as electron.exe from node_modules.
 *
 * @license Apache-2.0
 */

import { spawnSync } from 'node:child_process';

export const PACKAGED_EXECUTABLE_NAME = '1onecode';

export const WIN_PACKAGED_EXE = `${PACKAGED_EXECUTABLE_NAME}.exe`;

export const MAC_PACKAGED_EXE = PACKAGED_EXECUTABLE_NAME;

/** Legacy binary names — still killed on restart so old installs do not linger. */
export const WIN_LEGACY_PACKAGED_EXES = ['1OneClaudeCode.exe', 'AionUi.exe'];

export const MAC_LEGACY_PACKAGED_EXES = ['1OneClaudeCode', 'AionUi'];

const WIN_PROCESS_NAMES_TO_KILL = ['electron.exe', WIN_PACKAGED_EXE, ...WIN_LEGACY_PACKAGED_EXES];

export function killWindowsAppProcesses() {
  for (const imageName of WIN_PROCESS_NAMES_TO_KILL) {
    spawnSync('taskkill', ['/F', '/IM', imageName, '/T'], { stdio: 'ignore' });
  }
}
