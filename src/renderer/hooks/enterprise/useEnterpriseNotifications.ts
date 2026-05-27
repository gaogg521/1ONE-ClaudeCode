/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import type { UserNotificationRecord } from '@/common/types/userNotification';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/renderer/utils/enterpriseApi/modules';

const POLL_INTERVAL_MS = 30_000;

export function useEnterpriseNotifications(enabled: boolean) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<UserNotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshUnreadCount = useCallback(async () => {
    if (!enabled) {
      setUnreadCount(0);
      return;
    }
    try {
      const result = await getUnreadNotificationCount();
      setUnreadCount(result.count);
    } catch {
      // WebUI may be unavailable in desktop mode
    }
  }, [enabled]);

  const refreshNotifications = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listNotifications({ limit: 30 });
      setItems(list);
      await refreshUnreadCount();
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, refreshUnreadCount]);

  const markRead = useCallback(
    async (notificationId: string) => {
      await markNotificationRead(notificationId);
      setItems((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, read_at: item.read_at ?? Date.now() } : item
        )
      );
      setUnreadCount((current) => Math.max(0, current - 1));
    },
    []
  );

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    const now = Date.now();
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })));
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    void refreshUnreadCount();
    const timer = window.setInterval(() => {
      void refreshUnreadCount();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refreshUnreadCount]);

  return {
    unreadCount,
    items,
    loading,
    refreshNotifications,
    refreshUnreadCount,
    markRead,
    markAllRead,
  };
}
