/**
 * Sessions — Claude Code 会话中心（接真实数据）
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button, Input, Tag, Tooltip, Spin, Empty, Typography } from '@arco-design/web-react';
import { Add, Search, Play, Delete, Left, FolderOpen, Right, Pushpin, Star } from '@icon-park/react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { useTranslation } from 'react-i18next';

const BACKEND_LABEL: Record<string, { label: string; color: string }> = {
  claude:     { label: 'Claude Code', color: 'blue' },
  gemini:     { label: 'Gemini',      color: 'green' },
  qwen:       { label: 'Qwen',        color: 'orangered' },
  codex:      { label: 'Codex',       color: 'purple' },
  codebuddy:  { label: 'CodeBuddy',   color: 'cyan' },
  opencode:   { label: 'OpenCode',    color: 'gold' },
};

function getBackendInfo(conv: TChatConversation) {
  if (conv.type === 'acp') {
    const backend = (conv.extra as { backend?: string }).backend ?? 'claude';
    return BACKEND_LABEL[backend] ?? { label: backend, color: 'arcoblue' };
  }
  return { label: 'Gemini', color: 'green' };
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return d.toLocaleTimeString('zh', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString('zh', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('zh', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const SessionCard: React.FC<{ conv: TChatConversation; onDelete: (id: string) => void }> = ({ conv, onDelete }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const backend = getBackendInfo(conv);
  const isRunning = conv.status === 'running';
  const extra = conv.extra as { pinned?: boolean; favorited?: boolean } | undefined;
  const pinned = Boolean(extra?.pinned);
  const favorited = Boolean(extra?.favorited);

  const handleTogglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await ipcBridge.conversation.update.invoke({
      id: conv.id,
      updates: {
        extra: {
          pinned: !pinned,
          pinnedAt: pinned ? undefined : Date.now(),
        } as Partial<TChatConversation['extra']>,
      } as Partial<TChatConversation>,
      mergeExtra: true,
    });
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await ipcBridge.conversation.update.invoke({
      id: conv.id,
      updates: {
        extra: {
          favorited: !favorited,
          favoritedAt: favorited ? undefined : Date.now(),
        } as Partial<TChatConversation['extra']>,
      } as Partial<TChatConversation>,
      mergeExtra: true,
    });
  };

  return (
    <div
      style={{
        background: 'var(--color-bg-2)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 8,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary-6)')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
      onClick={() => navigate(`/conversation/${conv.id}`)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: isRunning ? '#52c41a' : 'var(--color-text-4)',
            }}
          />
          <span
            style={{
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--color-text-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {conv.name || '未命名会话'}
          </span>
          <Tag size='small' color={backend.color} style={{ flexShrink: 0 }}>{backend.label}</Tag>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <Tooltip content={favorited ? t('conversation.history.unfavorite') : t('conversation.history.favorite')}>
            <Button
              type='text'
              size='mini'
              icon={<Star theme={favorited ? 'filled' : 'outline'} size={14} />}
              onClick={handleToggleFavorite}
            />
          </Tooltip>
          <Tooltip content={pinned ? t('conversation.history.unpin') : t('conversation.history.pin')}>
            <Button
              type='text'
              size='mini'
              icon={<Pushpin theme={pinned ? 'filled' : 'outline'} size={14} />}
              onClick={handleTogglePin}
            />
          </Tooltip>
          <Tooltip content='继续会话'>
            <Button
              type='text' size='mini'
              icon={<Play theme='outline' size={14} />}
              onClick={(e) => { e.stopPropagation(); navigate(`/conversation/${conv.id}`); }}
            />
          </Tooltip>
          <Tooltip content='删除'>
            <Button
              type='text' size='mini' status='danger'
              icon={<Delete theme='outline' size={14} />}
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
            />
          </Tooltip>
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-3)', display: 'flex', gap: 16 }}>
        <span>修改: {formatTime(conv.modifyTime)}</span>
        <span>创建: {formatTime(conv.createTime)}</span>
      </div>
    </div>
  );
};

const SessionsPage: React.FC = () => {
  const { t } = useTranslation();
  const [convs, setConvs] = useState<TChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ipcBridge.database.getUserConversations.invoke({ page: 0, pageSize: 1000 });
      if (Array.isArray(data)) {
        const filtered = data.filter((c) => {
          const extra = c.extra as { isHealthCheck?: boolean; teamId?: string } | undefined;
          return !extra?.isHealthCheck && !extra?.teamId;
        });
        // Sort: pinned first, then favorited, then modifyTime desc
        filtered.sort((a, b) => {
          const aExtra = a.extra as { pinned?: boolean; favorited?: boolean } | undefined;
          const bExtra = b.extra as { pinned?: boolean; favorited?: boolean } | undefined;
          const ap = aExtra?.pinned ? 1 : 0;
          const bp = bExtra?.pinned ? 1 : 0;
          if (ap !== bp) return bp - ap;
          const af = aExtra?.favorited ? 1 : 0;
          const bf = bExtra?.favorited ? 1 : 0;
          if (af !== bf) return bf - af;
          return b.modifyTime - a.modifyTime;
        });
        setConvs(filtered);
      }
    } catch (e) {
      console.error('Failed to load conversations:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // 监听会话列表变化
    const unsub = ipcBridge.conversation.listChanged.on(() => void load());
    return () => unsub();
  }, [load]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await ipcBridge.conversation.remove.invoke({ id });
      setConvs((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error('Failed to delete conversation:', e);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return convs;
    return convs.filter((c) => (c.name || '').toLowerCase().includes(q));
  }, [convs, search]);

  // Default view: show latest 10 (by modifyTime). Remaining are grouped into "folders" by create date.
  const { recent, folders } = useMemo(() => {
    const recentList = filtered.slice(0, 10);
    const rest = filtered.slice(10);
    const map = new Map<string, TChatConversation[]>();
    for (const c of rest) {
      const key = formatDateKey(c.createTime);
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    const folderKeys = [...map.keys()].toSorted((a, b) => b.localeCompare(a));
    const folderItems = folderKeys.map((k) => {
      const list = (map.get(k) ?? []).toSorted((a, b) => b.createTime - a.createTime);
      const latest = list[0];
      const subtitle = latest?.name || '';
      const lastModify = latest?.modifyTime ?? 0;
      return { key: k, count: list.length, conversations: list, subtitle, lastModify };
    });
    return { recent: recentList, folders: folderItems };
  }, [filtered]);

  const activeFolder = useMemo(() => {
    if (!activeDateKey) return null;
    return (
      folders.find((f) => f.key === activeDateKey) ?? {
        key: activeDateKey,
        count: 0,
        conversations: [] as TChatConversation[],
        subtitle: '',
        lastModify: 0,
      }
    );
  }, [activeDateKey, folders]);

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {activeDateKey ? (
            <Button
              type='text'
              icon={<Left theme='outline' size={16} />}
              onClick={() => setActiveDateKey(null)}
            >
              {t('common.back', { defaultValue: '返回' })}
            </Button>
          ) : null}
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text-1)' }}>
            {activeDateKey ? `${t('sessions.folderTitle')} · ${activeDateKey}` : t('sessions.title')}
          </h2>
        </div>
        <Button type='primary' icon={<Add theme='outline' />} size='small' onClick={() => navigate('/guid')}>
          {t('sessions.new')}
        </Button>
      </div>

      <Input
        prefix={<Search theme='outline' size={14} />}
        placeholder={t('sessions.searchPlaceholder')}
        value={search}
        onChange={(v) => {
          setSearch(v);
          // Search is a global filter; reset folder view so results aren't "hidden".
          if (activeDateKey) setActiveDateKey(null);
        }}
        style={{ marginBottom: 16 }}
        allowClear
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Spin />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 0' }}>
            <Empty
              description={
                search
                  ? t('sessions.emptySearch')
                  : t('sessions.empty')
              }
            />
            {!search && (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                <Button type='primary' icon={<Add theme='outline' />} onClick={() => navigate('/guid')}>
                  {t('sessions.startFirst')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            {activeDateKey ? (
              activeFolder?.conversations.map((c) => <SessionCard key={c.id} conv={c} onDelete={handleDelete} />)
            ) : (
              <>
                <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--color-text-3)' }}>
                  {t('sessions.recentLimitNote')}
                </div>
                {recent.map((c) => <SessionCard key={c.id} conv={c} onDelete={handleDelete} />)}

                {folders.length > 0 ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-2)', margin: '8px 0' }}>
                      {t('sessions.archiveByDate')}
                    </div>
                    {folders.map((f) => (
                      <div
                        key={f.key}
                        style={{
                          background: 'var(--color-bg-2)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 10,
                          padding: '10px 14px',
                          marginBottom: 8,
                          cursor: 'pointer',
                          transition: 'border-color 0.15s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary-6)')}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                        onClick={() => setActiveDateKey(f.key)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(var(--primary-6), 0.10)',
                              border: '1px solid rgba(var(--primary-6), 0.18)',
                              flexShrink: 0,
                            }}
                          >
                            <FolderOpen theme='outline' size={18} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                              <span style={{ fontWeight: 700, color: 'var(--color-text-1)' }}>{f.key}</span>
                              <Tag size='small' color='arcoblue'>
                                {t('sessions.count', { count: f.count })}
                              </Tag>
                              {f.lastModify ? (
                                <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
                                  {formatTime(f.lastModify)}
                                </span>
                              ) : null}
                            </div>
                            {f.subtitle ? (
                              <Typography.Ellipsis
                                className='text-12px text-t-tertiary'
                                style={{ marginTop: 4, maxWidth: '100%' }}
                              >
                                {f.subtitle}
                              </Typography.Ellipsis>
                            ) : (
                              <div className='text-12px text-t-tertiary' style={{ marginTop: 4 }}>
                                {t('sessions.folderSubtitleFallback', { defaultValue: '点击查看当天全部对话' })}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <Right theme='outline' size={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SessionsPage;
