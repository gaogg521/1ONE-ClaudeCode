/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONE_WEBUI_CONFIG_REFRESH, dispatchWebuiConfigRefresh } from '@/renderer/utils/webuiConfigSync';

describe('webuiConfigSync', () => {
  const listeners = new Map<string, Set<EventListener>>();

  beforeEach(() => {
    listeners.clear();
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        const set = listeners.get(event.type);
        set?.forEach((handler) => handler(event));
        return true;
      },
      addEventListener: (type: string, handler: EventListener) => {
        if (!listeners.has(type)) {
          listeners.set(type, new Set());
        }
        listeners.get(type)?.add(handler);
      },
      removeEventListener: (type: string, handler: EventListener) => {
        listeners.get(type)?.delete(handler);
      },
    });
  });

  it('dispatches config and enterprise refresh events', () => {
    const configHandler = vi.fn();
    const enterpriseHandler = vi.fn();
    window.addEventListener(ONE_WEBUI_CONFIG_REFRESH, configHandler);
    window.addEventListener('one-enterprise-context-refresh', enterpriseHandler);

    dispatchWebuiConfigRefresh();

    expect(configHandler).toHaveBeenCalledTimes(1);
    expect(enterpriseHandler).toHaveBeenCalledTimes(1);
  });
});
