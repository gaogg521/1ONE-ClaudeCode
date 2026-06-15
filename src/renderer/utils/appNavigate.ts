/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NavigateFunction, NavigateOptions } from 'react-router-dom';
import { isElectronDesktop } from '@/renderer/utils/platform';

/**
 * HashRouter in Electron does not always apply navigate() for in-app hash updates.
 * Keep React Router and window.location.hash in sync on desktop.
 */
export function appNavigate(navigate: NavigateFunction, path: string, options?: NavigateOptions): void {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn('[nav] appNavigate', {
      from: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      to: normalized,
      options,
    });
  }
  void navigate(normalized, options);
  if (!isElectronDesktop() || typeof window === 'undefined') {
    return;
  }
  const nextHash = `#${normalized}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}
