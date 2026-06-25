/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';

export type EnterpriseAsyncDataState<T> = {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: Dispatch<SetStateAction<T>>;
};

export function useEnterpriseAsyncData<T>(
  loader: () => Promise<T>,
  initialValue: T,
  errorMessage: string
): EnterpriseAsyncDataState<T> {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 请求序号 + 卸载标志，防止竞态（旧请求覆盖新结果）和卸载后 setState。
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (mountedRef.current && requestId === requestIdRef.current) {
        setData(result);
      }
    } catch (loadError) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(getEnterpriseActionError(loadError, errorMessage));
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [errorMessage, loader]);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => {
      mountedRef.current = false;
      requestIdRef.current++;
    };
  }, [reload]);

  return {
    data,
    loading,
    error,
    reload,
    setData,
  };
}
