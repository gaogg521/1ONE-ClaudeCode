/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/config/storage';
import useSWR from 'swr';

export const SHOW_USAGE_STATS_SWR_KEY = 'system.showUsageStats';

export const useShowUsageStats = (): boolean => {
  const { data = false } = useSWR(SHOW_USAGE_STATS_SWR_KEY, () =>
    ConfigStorage.get('system.showUsageStats').then((val) => Boolean(val))
  );
  return data;
};
