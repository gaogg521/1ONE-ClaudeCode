/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { useCallback, useEffect, useState } from 'react';
import { isElectronDesktop } from '@/renderer/utils/platform';

const UI_SCALE_DEFAULT = 1;
const UI_SCALE_MIN = 0.8;
const UI_SCALE_MAX = 1.3;
const UI_SCALE_STEP = 0.05;
const WEB_UI_SCALE_DEFAULT = 1.08;
const WEB_UI_SCALE_STORAGE_KEY = 'one.webui.uiScale';

export const FONT_SCALE_DEFAULT = UI_SCALE_DEFAULT;
export const FONT_SCALE_MIN = UI_SCALE_MIN;
export const FONT_SCALE_MAX = UI_SCALE_MAX;
export const FONT_SCALE_STEP = UI_SCALE_STEP;

// 确保缩放值在允许范围内 / Clamp UI scale to allowed range
const clampFontScale = (value: number) => {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return FONT_SCALE_DEFAULT;
  }
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));
};

const useFontScale = (): [number, (scale: number) => Promise<void>] => {
  const isDesktopRuntime = isElectronDesktop();
  const [fontScale, setFontScaleState] = useState(isDesktopRuntime ? FONT_SCALE_DEFAULT : WEB_UI_SCALE_DEFAULT);

  const applyWebUiScale = useCallback((scale: number) => {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--webui-ui-scale', String(scale));
  }, []);

  // 从主进程读取当前缩放，保持 UI 与 Electron 同步 / Pull zoom factor from main to keep UI state aligned
  const fetchZoomFactor = useCallback(async () => {
    if (!isDesktopRuntime) {
      try {
        const stored = window.localStorage.getItem(WEB_UI_SCALE_STORAGE_KEY);
        const parsed = stored ? Number.parseFloat(stored) : WEB_UI_SCALE_DEFAULT;
        const clamped = clampFontScale(parsed);
        setFontScaleState(clamped);
        applyWebUiScale(clamped);
      } catch {
        setFontScaleState(WEB_UI_SCALE_DEFAULT);
        applyWebUiScale(WEB_UI_SCALE_DEFAULT);
      }
      return;
    }

    try {
      const currentFactor = await ipcBridge.application.getZoomFactor.invoke();
      if (typeof currentFactor === 'number') {
        setFontScaleState(clampFontScale(currentFactor));
      }
    } catch (error) {
      console.error('Failed to fetch zoom factor:', error);
    }
  }, [applyWebUiScale, isDesktopRuntime]);

  useEffect(() => {
    void fetchZoomFactor();
  }, [fetchZoomFactor]);

  // 乐观更新 slider，同时通知主进程写入 zoom / Optimistically update slider and ask main process to persist zoom
  const setFontScale = useCallback(
    async (nextScale: number) => {
      const clamped = clampFontScale(nextScale);
      setFontScaleState(clamped);

      if (!isDesktopRuntime) {
        applyWebUiScale(clamped);
        try {
          window.localStorage.setItem(WEB_UI_SCALE_STORAGE_KEY, String(clamped));
        } catch {
          // Ignore storage write errors in restricted browser modes.
        }
        return;
      }

      try {
        const updatedFactor = await ipcBridge.application.setZoomFactor.invoke({ factor: clamped });
        if (typeof updatedFactor === 'number' && updatedFactor !== clamped) {
          setFontScaleState(clampFontScale(updatedFactor));
        }
      } catch (error) {
        console.error('Failed to set zoom factor:', error);
        void fetchZoomFactor();
      }
    },
    [applyWebUiScale, fetchZoomFactor, isDesktopRuntime]
  );

  return [fontScale, setFontScale];
};

export { clampFontScale };
export default useFontScale;
