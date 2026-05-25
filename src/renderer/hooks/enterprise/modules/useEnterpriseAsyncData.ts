/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
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

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loader());
    } catch (loadError) {
      setError(getEnterpriseActionError(loadError, errorMessage));
    } finally {
      setLoading(false);
    }
  }, [errorMessage, loader]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    data,
    loading,
    error,
    reload,
    setData,
  };
}
