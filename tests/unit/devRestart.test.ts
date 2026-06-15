import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const spawnMock = vi.hoisted(() => vi.fn(() => ({ unref: vi.fn() })));
const rmMock = vi.hoisted(() => vi.fn(async () => undefined));
const relaunchMock = vi.hoisted(() => vi.fn());
const exitMock = vi.hoisted(() => vi.fn());
const getPathMock = vi.hoisted(() => vi.fn(() => 'C:\\Users\\test\\AppData\\Roaming'));

vi.mock('@/common/electronSafe', () => ({
  electronApp: {
    get isPackaged() {
      return false;
    },
    getPath: getPathMock,
    relaunch: relaunchMock,
    exit: exitMock,
  },
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

vi.mock('node:fs', () => ({
  promises: {
    rm: rmMock,
  },
}));

import {
  resolveDevRestartScript,
  resolveNodeExecutable,
  scheduleApplicationRestart,
  spawnDevRestartScript,
} from '@/process/utils/devRestart';

describe('devRestart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.env.npm_node_execpath = 'C:\\Program Files\\nodejs\\node.exe';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.npm_node_execpath;
  });

  it('resolves restart script under project root', () => {
    expect(resolveDevRestartScript('D:/1one-command')).toBe(path.join('D:/1one-command', 'scripts', 'restart-dev.mjs'));
  });

  it('prefers npm_node_execpath for node binary', () => {
    expect(resolveNodeExecutable()).toBe('C:\\Program Files\\nodejs\\node.exe');
  });

  it('spawns restart-dev.mjs in dev mode', () => {
    expect(spawnDevRestartScript('D:\\1one-command')).toBe(true);
    const scriptArg = spawnMock.mock.calls[0]?.[1]?.[0];
    expect(scriptArg).toBe(path.join('D:\\1one-command', 'scripts', 'restart-dev.mjs'));
    expect(spawnMock).toHaveBeenCalledWith(
      'C:\\Program Files\\nodejs\\node.exe',
      [scriptArg],
      expect.objectContaining({
        cwd: 'D:\\1one-command',
        detached: true,
      })
    );
  });

  it('schedules dev restart via restart-dev script instead of relaunching electron argv', () => {
    scheduleApplicationRestart();

    expect(rmMock).toHaveBeenCalledWith(
      path.join('C:\\Users\\test\\AppData\\Roaming', '1OneClaudeCode-Dev', 'lockfile'),
      { force: true }
    );
    expect(spawnMock).toHaveBeenCalled();
    expect(relaunchMock).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(exitMock).toHaveBeenCalledWith(0);
  });
});
