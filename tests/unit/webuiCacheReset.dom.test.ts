import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCacheBustedWebuiUrl,
  clearWebuiServiceWorkerCaches,
  resetWebuiClientCaches,
} from '@/renderer/services/webuiCacheReset';

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      clearRendererHttpCache: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

afterEach(() => {
  Reflect.deleteProperty(window, 'caches');
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('webuiCacheReset', () => {
  it('clears only WebUI service worker caches during normal startup cleanup', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['1one-claudecode-webui-v1', 'unrelated-cache']),
        delete: deleteCache,
      },
    });

    await clearWebuiServiceWorkerCaches();

    expect(deleteCache).toHaveBeenCalledWith('1one-claudecode-webui-v1');
    expect(deleteCache).not.toHaveBeenCalledWith('unrelated-cache');
  });

  it('clears all Cache API entries and unregisters service workers for hard recovery', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const unregisterA = vi.fn().mockResolvedValue(true);
    const unregisterB = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['1one-claudecode-webui-v1', 'vite-preload-cache']),
        delete: deleteCache,
      },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([
          { unregister: unregisterA },
          { unregister: unregisterB },
        ]),
      },
    });

    await resetWebuiClientCaches();

    expect(deleteCache).toHaveBeenCalledWith('1one-claudecode-webui-v1');
    expect(deleteCache).toHaveBeenCalledWith('vite-preload-cache');
    expect(unregisterA).toHaveBeenCalled();
    expect(unregisterB).toHaveBeenCalled();
  });

  it('adds a top-level cache-bust query while preserving hash-router path', () => {
    expect(buildCacheBustedWebuiUrl('http://host:25809/#/guid?tab=agents', 1234)).toBe(
      'http://host:25809/?__one_cache_bust=1234#/guid?tab=agents'
    );
  });
});
