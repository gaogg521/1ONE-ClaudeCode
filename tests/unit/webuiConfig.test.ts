/**
 * @license
 * Copyright 2025 1ONE ClaudeCode (1one-claudecode.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('webuiConfig module', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    vi.doMock('electron', () => ({
      app: {
        getPath: vi.fn(() => '/mock/userData'),
      },
      ipcMain: {
        handle: vi.fn(),
        on: vi.fn(),
        removeHandler: vi.fn(),
      },
    }));

    vi.doMock('fs', () => ({
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => '{}'),
    }));

    vi.doMock('@process/bridge/webuiBridge', () => ({
      setWebServerInstance: vi.fn(),
    }));

    vi.doMock('@process/utils/initStorage', () => ({
      ProcessConfig: {
        get: vi.fn(() => Promise.resolve(undefined)),
        set: vi.fn(() => Promise.resolve()),
      },
    }));

    vi.doMock('@process/webserver', () => ({
      startWebServerWithInstance: vi.fn(() => Promise.resolve({ port: 3000 })),
    }));

    vi.doMock('@process/webserver/config/constants', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@process/webserver/config/constants')>();
      return {
        ...actual,
        SERVER_CONFIG: { ...actual.SERVER_CONFIG, DEFAULT_PORT: 3000 },
      };
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('parsePortValue', () => {
    it('should parse valid port numbers', async () => {
      const { parsePortValue } = await import('@process/utils/webuiConfig');

      expect(parsePortValue(8080)).toBe(8080);
      expect(parsePortValue('3000')).toBe(3000);
      expect(parsePortValue(1)).toBe(1);
      expect(parsePortValue(65535)).toBe(65535);
    });

    it('should return null for invalid values', async () => {
      const { parsePortValue } = await import('@process/utils/webuiConfig');

      expect(parsePortValue(null)).toBeNull();
      expect(parsePortValue(undefined)).toBeNull();
      expect(parsePortValue('')).toBeNull();
      expect(parsePortValue(0)).toBeNull();
      expect(parsePortValue(-1)).toBeNull();
      expect(parsePortValue(70000)).toBeNull();
      expect(parsePortValue('abc')).toBeNull();
    });
  });

  describe('parseBooleanEnv', () => {
    it('should parse truthy values', async () => {
      const { parseBooleanEnv } = await import('@process/utils/webuiConfig');

      expect(parseBooleanEnv('1')).toBe(true);
      expect(parseBooleanEnv('true')).toBe(true);
      expect(parseBooleanEnv('yes')).toBe(true);
      expect(parseBooleanEnv('on')).toBe(true);
      expect(parseBooleanEnv('TRUE')).toBe(true);
    });

    it('should parse falsy values', async () => {
      const { parseBooleanEnv } = await import('@process/utils/webuiConfig');

      expect(parseBooleanEnv('0')).toBe(false);
      expect(parseBooleanEnv('false')).toBe(false);
      expect(parseBooleanEnv('no')).toBe(false);
      expect(parseBooleanEnv('off')).toBe(false);
    });

    it('should return null for empty or undefined', async () => {
      const { parseBooleanEnv } = await import('@process/utils/webuiConfig');

      expect(parseBooleanEnv(undefined)).toBeNull();
      expect(parseBooleanEnv('')).toBeNull();
    });
  });

  describe('loadUserWebUIConfig', () => {
    it('should return empty config when file does not exist', async () => {
      const { loadUserWebUIConfig } = await import('@process/utils/webuiConfig');
      const result = loadUserWebUIConfig();

      expect(result.exists).toBe(false);
      expect(result.config).toEqual({});
    });

    it('should load config from file', async () => {
      vi.doUnmock('fs');
      vi.doMock('fs', () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => JSON.stringify({ port: 8080, allowRemote: true })),
      }));

      const { loadUserWebUIConfig } = await import('@process/utils/webuiConfig');
      const result = loadUserWebUIConfig();

      expect(result.exists).toBe(true);
      expect(result.config.port).toBe(8080);
      expect(result.config.allowRemote).toBe(true);
    });
  });

  describe('resolveWebUIPort', () => {
    it('should use CLI switch value first', async () => {
      const { resolveWebUIPort } = await import('@process/utils/webuiConfig');
      const getSwitchValue = (flag: string) => (flag === 'port' ? '9090' : undefined);

      expect(resolveWebUIPort({}, getSwitchValue)).toBe(9090);
    });

    it('should fallback to env variable', async () => {
      process.env.ONE_PORT = '7070';
      const { resolveWebUIPort } = await import('@process/utils/webuiConfig');

      expect(resolveWebUIPort({}, () => undefined)).toBe(7070);
    });

    it('should fallback to config port', async () => {
      const { resolveWebUIPort } = await import('@process/utils/webuiConfig');

      expect(resolveWebUIPort({ port: 5050 }, () => undefined)).toBe(5050);
    });

    it('should fallback to default port', async () => {
      const { resolveWebUIPort } = await import('@process/utils/webuiConfig');

      expect(resolveWebUIPort({}, () => undefined)).toBe(3000);
    });
  });

  describe('resolveDesktopWebUIEnabledPreference', () => {
    it('defaults to enabled when preference is unset', async () => {
      const { resolveDesktopWebUIEnabledPreference } = await import('@process/utils/webuiConfig');

      expect(resolveDesktopWebUIEnabledPreference(undefined)).toBe(true);
      expect(resolveDesktopWebUIEnabledPreference(true)).toBe(true);
    });

    it('respects explicit disable', async () => {
      const { resolveDesktopWebUIEnabledPreference } = await import('@process/utils/webuiConfig');

      expect(resolveDesktopWebUIEnabledPreference(false)).toBe(false);
    });
  });

  describe('restoreDesktopWebUIFromPreferences', () => {
    it('auto-starts WebUI when preference is unset', async () => {
      const { ProcessConfig } = await import('@process/utils/initStorage');
      const { startWebServerWithInstance } = await import('@process/webserver');
      const { setWebServerInstance } = await import('@process/bridge/webuiBridge');
      const { restoreDesktopWebUIFromPreferences } = await import('@process/utils/webuiConfig');

      await restoreDesktopWebUIFromPreferences();

      expect(startWebServerWithInstance).toHaveBeenCalledWith(3000, false);
      expect(setWebServerInstance).toHaveBeenCalledWith({ port: 3000 });
      expect(ProcessConfig.set).toHaveBeenCalledWith('webui.desktop.enabled', true);
    });

    it('skips auto-start when user explicitly disabled WebUI', async () => {
      const { ProcessConfig } = await import('@process/utils/initStorage');
      vi.mocked(ProcessConfig.get).mockResolvedValue(false);

      const { startWebServerWithInstance } = await import('@process/webserver');
      const { restoreDesktopWebUIFromPreferences } = await import('@process/utils/webuiConfig');

      await restoreDesktopWebUIFromPreferences();

      expect(startWebServerWithInstance).not.toHaveBeenCalled();
    });
  });

  describe('resolveRemoteAccess', () => {
    it('should return true when isRemoteMode is true', async () => {
      const { resolveRemoteAccess } = await import('@process/utils/webuiConfig');

      expect(resolveRemoteAccess({}, true)).toBe(true);
    });

    it('should return true when env says allow remote', async () => {
      process.env.ONE_ALLOW_REMOTE = '1';
      const { resolveRemoteAccess } = await import('@process/utils/webuiConfig');

      expect(resolveRemoteAccess({}, false)).toBe(true);
    });

    it('should return true when host is 0.0.0.0', async () => {
      process.env.ONE_HOST = '0.0.0.0';
      const { resolveRemoteAccess } = await import('@process/utils/webuiConfig');

      expect(resolveRemoteAccess({}, false)).toBe(true);
    });

    it('should return true when config allows remote', async () => {
      const { resolveRemoteAccess } = await import('@process/utils/webuiConfig');

      expect(resolveRemoteAccess({ allowRemote: true }, false)).toBe(true);
    });

    it('should return false when nothing enables remote', async () => {
      const { resolveRemoteAccess } = await import('@process/utils/webuiConfig');

      expect(resolveRemoteAccess({}, false)).toBe(false);
    });
  });
});
