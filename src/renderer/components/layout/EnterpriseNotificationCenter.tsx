/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Badge, Button, Dropdown, Empty, Spin } from '@arco-design/web-react';
import { Remind } from '@icon-park/react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { UserNotificationKind, UserNotificationRecord } from '@/common/types/userNotification';
import { useEnterpriseNotifications } from '@/renderer/hooks/enterprise/useEnterpriseNotifications';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';

type EnterpriseNotificationCenterProps = {
  enabled: boolean;
};

function formatRelativeTime(timestamp: number): string {
  const deltaMs = Date.now() - timestamp;
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function resolveKindLabel(kind: UserNotificationKind, t: (key: string) => string): string {
  const key = `common.notifications.kinds.${kind}`;
  const translated = t(key);
  return translated === key ? kind : translated;
}

const NotificationList: React.FC<{
  items: UserNotificationRecord[];
  loading: boolean;
  onOpen: (item: UserNotificationRecord) => void;
  onMarkAllRead: () => void;
}> = ({ items, loading, onOpen, onMarkAllRead }) => {
  const { t } = useTranslation();
  const hasUnread = items.some((item) => !item.read_at);

  return (
    <div className='w-360px max-w-[92vw] bg-2 border border-[var(--border-base)] rd-8px shadow-lg overflow-hidden'>
      <div className='flex items-center justify-between px-12px py-10px border-b border-[var(--border-base)]'>
        <span className='text-14px font-500 text-t-primary'>{t('common.notifications.title')}</span>
        {hasUnread ? (
          <Button type='text' size='mini' onClick={() => void onMarkAllRead()}>
            {t('common.notifications.markAllRead')}
          </Button>
        ) : null}
      </div>
      <div className='max-h-360px overflow-y-auto'>
        {loading ? (
          <div className='py-24px flex justify-center'>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <Empty description={t('common.notifications.empty')} />
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type='button'
              className={classNames(
                'w-full text-left px-12px py-10px border-b border-[var(--border-base)] hover:bg-fill-2 transition-colors',
                !item.read_at && 'bg-primary-1'
              )}
              onClick={() => onOpen(item)}
            >
              <div className='flex items-start justify-between gap-8px'>
                <div className='min-w-0 flex-1'>
                  <div className='text-13px font-500 text-t-primary truncate'>{item.title}</div>
                  <div className='text-12px text-t-secondary mt-4px line-clamp-2 whitespace-pre-wrap'>
                    {item.body}
                  </div>
                  <div className='text-11px text-t-tertiary mt-6px'>
                    {resolveKindLabel(item.kind, t)} · {formatRelativeTime(item.created_at)}
                  </div>
                </div>
                {!item.read_at ? <span className='mt-4px w-8px h-8px rd-full bg-primary shrink-0' /> : null}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

const EnterpriseNotificationCenter: React.FC<EnterpriseNotificationCenterProps> = ({ enabled }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const iconSize = layout?.isMobile ? 24 : 18;
  const {
    unreadCount,
    items,
    loading,
    refreshNotifications,
    markRead,
    markAllRead,
  } = useEnterpriseNotifications(enabled);

  const droplist = useMemo(
    () => (
      <NotificationList
        items={items}
        loading={loading}
        onOpen={(item) => {
          if (!item.read_at) {
            void markRead(item.id);
          }
          if (item.link_path) {
            void navigate(item.link_path);
          }
        }}
        onMarkAllRead={() => void markAllRead()}
      />
    ),
    [items, loading, markAllRead, markRead, navigate]
  );

  if (!enabled) {
    return null;
  }

  return (
    <Dropdown
      droplist={droplist}
      trigger='click'
      position='br'
      onVisibleChange={(visible) => {
        if (visible) {
          void refreshNotifications();
        }
      }}
    >
      <button
        type='button'
        className={classNames('app-titlebar__button', layout?.isMobile && 'app-titlebar__button--mobile')}
        aria-label={t('common.notifications.title')}
      >
        <Badge count={unreadCount > 0 ? unreadCount : undefined} maxCount={99}>
          <Remind theme='outline' size={iconSize} fill='currentColor' />
        </Badge>
      </button>
    </Dropdown>
  );
};

export default EnterpriseNotificationCenter;
