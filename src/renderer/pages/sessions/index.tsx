/**
 * Sessions — Claude Code 会话中心（接真实数据）
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Button, Input, Tag, Tooltip, Spin, Empty, Typography } from '@arco-design/web-react';
import { Add, Search, Play, Delete, Left, FolderOpen, Right, Pushpin, Star } from '@icon-park/react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { TTeam } from '@/common/types/teamTypes';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { openAdminConsole } from '@/renderer/utils/openAdminConsole';
import { useTeamList } from '@/renderer/pages/team/hooks/useTeamList';
import TeamCreateModal from '@/renderer/pages/team/components/TeamCreateModal';

type WorkspaceScope = 'all' | 'personal' | 'team';

function parseWorkspaceScopeSearch(search: string): {
  scope: WorkspaceScope;
  teamId: string | null;
  teamName: string | null;
  issueId: string | null;
  issueSubject: string | null;
} {
  const params = new URLSearchParams(search);
  const value = params.get('scope');
  const scope: WorkspaceScope =
    value === 'personal' || value === 'team' || value === 'all' ? value : 'all';
  return {
    scope,
    teamId: params.get('teamId'),
    teamName: params.get('teamName'),
    issueId: params.get('issueId'),
    issueSubject: params.get('issueSubject'),
  };
}

function resolveWorkspaceScope(search: string): WorkspaceScope {
  const value = new URLSearchParams(search).get('scope');
  if (value === 'personal' || value === 'team' || value === 'all') {
    return value;
  }
  return 'all';
}

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

function isTeamConversation(conv: TChatConversation): boolean {
  const extra = conv.extra as { teamId?: string } | undefined;
  return Boolean(extra?.teamId);
}

function getSessionOpenPath(conv: TChatConversation): string {
  const extra = conv.extra as { teamId?: string } | undefined;
  if (extra?.teamId) {
    return `/team/${extra.teamId}`;
  }
  return `/conversation/${conv.id}`;
}

function buildWorkspaceScopePath(pathname: string, search: string, scope: WorkspaceScope): string {
  const params = new URLSearchParams(search);
  params.set('scope', scope);
  return `${pathname}?${params.toString()}`;
}

function buildIssueKanbanPath(
  issueId: string,
  issueSubject: string,
  teamId?: string | null,
  teamName?: string | null
): string {
  const params = new URLSearchParams();
  if (teamId) {
    params.set('teamId', teamId);
  }
  if (teamId && teamName) {
    params.set('teamName', teamName);
  }
  params.set('issueSubject', issueSubject);
  const query = params.toString();
  return query ? `/issues/${encodeURIComponent(issueId)}?${query}` : `/issues/${encodeURIComponent(issueId)}`;
}

function buildTeamSessionPath(teamId: string, issueId?: string | null, issueSubject?: string | null): string {
  if (!issueId || !issueSubject) {
    return `/team/${teamId}`;
  }
  const params = new URLSearchParams({
    issueId,
    issueSubject,
  });
  return `/team/${teamId}?${params.toString()}`;
}

const SessionCard: React.FC<{
  conv: TChatConversation;
  onDelete: (id: string) => void;
  matchPreview?: string;
}> = ({ conv, onDelete, matchPreview }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const backend = getBackendInfo(conv);
  const isRunning = conv.status === 'running';
  const extra = conv.extra as { pinned?: boolean; favorited?: boolean } | undefined;
  const pinned = Boolean(extra?.pinned);
  const favorited = Boolean(extra?.favorited);
  const openPath = getSessionOpenPath(conv);

  const handleTogglePin = (e: Event) => {
    (e as unknown as React.MouseEvent<HTMLElement>).stopPropagation();
    void ipcBridge.conversation.update.invoke({
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

  const handleToggleFavorite = (e: Event) => {
    (e as unknown as React.MouseEvent<HTMLElement>).stopPropagation();
    void ipcBridge.conversation.update.invoke({
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
      onClick={() => navigate(openPath)}
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
          <Tag size='small' color={backend.color} style={{ flexShrink: 0 }}>
            {backend.label}
          </Tag>
          {(() => {
            const extra2 = conv.extra as { teamId?: string } | undefined;
            if (!extra2?.teamId) return null;
            return (
              <Tag size='small' color='purple' style={{ flexShrink: 0 }}>
                团队
              </Tag>
            );
          })()}
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
              onClick={(e) => { e.stopPropagation(); navigate(openPath); }}
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
      {matchPreview ? (
        <Typography.Ellipsis className='text-12px text-t-tertiary' style={{ marginTop: 6, maxWidth: '100%' }}>
          {matchPreview}
        </Typography.Ellipsis>
      ) : null}
      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-3)', display: 'flex', gap: 16 }}>
        <span>修改: {formatTime(conv.modifyTime)}</span>
        <span>创建: {formatTime(conv.createTime)}</span>
      </div>
    </div>
  );
};

const CONTENT_SEARCH_PAGE_SIZE = 100;
const CONTENT_SEARCH_MAX_PAGES = 10;
const CONTENT_SEARCH_DEBOUNCE_MS = 250;

async function fetchContentMatchMap(keyword: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 0;

  while (page < CONTENT_SEARCH_MAX_PAGES) {
    const result = await ipcBridge.database.searchConversationMessages.invoke({
      keyword,
      page,
      pageSize: CONTENT_SEARCH_PAGE_SIZE,
    });

    for (const item of result.items) {
      if (!map.has(item.conversation.id)) {
        map.set(item.conversation.id, item.previewText);
      }
    }

    if (!result.hasMore) {
      break;
    }
    page += 1;
  }

  return map;
}

const SessionsPage: React.FC = () => {
  const { t } = useTranslation();
  const auth = useAuth();
  const [convs, setConvs] = useState<TChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [contentMatchMap, setContentMatchMap] = useState<Map<string, string>>(() => new Map());
  const [contentSearchLoading, setContentSearchLoading] = useState(false);
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null);
  const [createTeamVisible, setCreateTeamVisible] = useState(false);
  const location = useLocation();
  const [scope, setScope] = useState<WorkspaceScope>(() => resolveWorkspaceScope(location.search));
  const navigate = useNavigate();
  const { hasJoinedEnterprise, isEnterpriseEdition, tenantLabel, showEnterpriseAdminNav } = useEditionFeatures();
  const enterpriseMode = useWebuiEnterpriseMode();
  const { mutate: refreshTeams } = useTeamList();
  const {
    teamId: scopedTeamId,
    teamName: scopedTeamName,
    issueId: scopedIssueId,
    issueSubject: scopedIssueSubject,
  } = parseWorkspaceScopeSearch(location.search);
  const isCurrentTeamScope = scope === 'team' && Boolean(scopedTeamId);
  const isTeamScopeWithoutTeam = scope === 'team' && !scopedTeamId;

  const handleOpenAdminConsole = useCallback(() => {
    void openAdminConsole({
      navigate: (path) => {
        void navigate(path);
      },
      openEnterpriseAdminInBrowser: enterpriseMode.openEnterpriseAdminInBrowser,
    });
  }, [enterpriseMode.openEnterpriseAdminInBrowser, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ipcBridge.database.getUserConversations.invoke({ page: 0, pageSize: 1000 });
      if (Array.isArray(data)) {
        const filtered = data.filter((c) => {
          const extra = c.extra as { isHealthCheck?: boolean; teamId?: string } | undefined;
          return !extra?.isHealthCheck;
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

  useEffect(() => {
    setScope(resolveWorkspaceScope(location.search));
    setActiveDateKey(null);
  }, [location.search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, CONTENT_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const keyword = debouncedSearch.trim();
    if (!keyword) {
      setContentMatchMap(new Map());
      setContentSearchLoading(false);
      return;
    }

    let cancelled = false;
    setContentSearchLoading(true);

    void fetchContentMatchMap(keyword)
      .then((map) => {
        if (!cancelled) {
          setContentMatchMap(map);
        }
      })
      .catch((error) => {
        console.error('[SessionsPage] Content search failed:', error);
        if (!cancelled) {
          setContentMatchMap(new Map());
        }
      })
      .finally(() => {
        if (!cancelled) {
          setContentSearchLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await ipcBridge.conversation.remove.invoke({ id });
      setConvs((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error('Failed to delete conversation:', e);
    }
  }, []);

  const scopeCounts = useMemo(
    () => ({
      all: convs.length,
      personal: convs.filter((conv) => !isTeamConversation(conv)).length,
      team: convs.filter((conv) => {
        if (!isTeamConversation(conv)) return false;
        if (!scopedTeamId) return true;
        const extra = conv.extra as { teamId?: string } | undefined;
        return extra?.teamId === scopedTeamId;
      }).length,
    }),
    [convs, scopedTeamId]
  );

  const filtered = useMemo(() => {
    const scopeFiltered = convs.filter((conv) => {
      if (scope === 'personal') return !isTeamConversation(conv);
      if (scope === 'team') {
        if (!isTeamConversation(conv)) return false;
        if (!scopedTeamId) return true;
        const extra = conv.extra as { teamId?: string } | undefined;
        return extra?.teamId === scopedTeamId;
      }
      return true;
    });
    const q = search.trim().toLowerCase();
    const debouncedQ = debouncedSearch.trim().toLowerCase();
    if (!q && !debouncedQ) return scopeFiltered;

    return scopeFiltered.filter((c) => {
      const nameMatch = q ? (c.name || '').toLowerCase().includes(q) : false;
      const contentMatch = debouncedQ ? contentMatchMap.has(c.id) : false;
      return nameMatch || contentMatch;
    });
  }, [convs, scope, scopedTeamId, search, debouncedSearch, contentMatchMap]);

  const isSearchActive = Boolean(search.trim());

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
      const list = [...(map.get(k) ?? [])].toSorted((a, b) => b.createTime - a.createTime);
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

  const applyScope = (nextScope: WorkspaceScope) => {
    setScope(nextScope);
    setActiveDateKey(null);
    navigate(buildWorkspaceScopePath(location.pathname, location.search, nextScope), { replace: true });
  };

  const handleOpenCurrentTeam = useCallback(() => {
    if (!scopedTeamId) return;
    navigate(buildTeamSessionPath(scopedTeamId, scopedIssueId, scopedIssueSubject));
  }, [navigate, scopedIssueId, scopedIssueSubject, scopedTeamId]);

  const handleNewAction = useCallback(() => {
    if (isCurrentTeamScope) {
      handleOpenCurrentTeam();
      return;
    }
    if (scope === 'team') {
      setCreateTeamVisible(true);
      return;
    }
    navigate('/guid');
  }, [handleOpenCurrentTeam, isCurrentTeamScope, navigate, scope]);

  const handleTeamCreated = useCallback(
    async (team: TTeam) => {
      setCreateTeamVisible(false);
      navigate(buildTeamSessionPath(team.id, scopedIssueId, scopedIssueSubject));
      await refreshTeams();
    },
    [navigate, refreshTeams, scopedIssueId, scopedIssueSubject]
  );

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
        <Button
          type='primary'
          icon={<Add theme='outline' />}
          size='small'
          onClick={handleNewAction}
        >
          {isCurrentTeamScope
            ? t('team.continueTeamCollaboration', { defaultValue: '继续团队协同' })
            : scope === 'team'
              ? t('team.createTeamSession', { defaultValue: '新建团队会话' })
              : t('sessions.new')}
        </Button>
      </div>

      {hasJoinedEnterprise ? (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid var(--color-border-2)',
            background: 'var(--color-fill-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-1)', marginBottom: 4 }}>
              {t('common.workspace.hub.enterpriseTitle', {
                defaultValue: '企业协同与平台能力',
              })}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', lineHeight: 1.6 }}>
              {auth.status === 'authenticated'
                ? t('common.workspace.hub.enterpriseDesc', {
                    defaultValue:
                      '已加入 {{tenant}}。现在可以从主工作台直接进入企业协同与平台能力，不必先切到独立管理页。',
                    tenant: tenantLabel ?? t('settings.edition.enterprise', { defaultValue: '1ONE Code 企业版' }),
                  })
                : t('common.workspace.hub.enterpriseInstanceDesc', {
                    defaultValue:
                      '当前实例已接入 {{tenant}}。登录企业账号后，即可从主工作台直接进入企业协同与平台能力。',
                    tenant: tenantLabel ?? t('settings.edition.enterprise', { defaultValue: '1ONE Code 企业版' }),
                  })}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Tag size='small' color={isEnterpriseEdition ? 'arcoblue' : 'gray'}>
              {isEnterpriseEdition
                ? t('settings.edition.enterprise', { defaultValue: '1ONE Code 企业版' })
                : t('settings.edition.personal', { defaultValue: '个人版' })}
            </Tag>
            {tenantLabel ? (
              <Tag size='small' color='green'>
                {tenantLabel}
              </Tag>
            ) : null}
            <Button size='small' onClick={() => navigate('/workspace')}>
              {t('common.workspace.hub.enterpriseOverviewTitle', {
                defaultValue: '企业能力总览',
              })}
            </Button>
            {showEnterpriseAdminNav ? (
              <Button size='small' type='outline' onClick={handleOpenAdminConsole}>
                {t('settings.edition.openAdminConsole', { defaultValue: '管理后台' })}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {hasJoinedEnterprise ? (
        <div
          style={{
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
            {t('common.workspace.scopeHint', {
              defaultValue: '切换查看个人工作内容与团队协同范围。',
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              size='small'
              type={scope === 'all' ? 'primary' : 'outline'}
              onClick={() => applyScope('all')}
            >
              {t('common.workspace.scopeAll', { defaultValue: '全部' })}
            </Button>
            <Tag size='small' color='gray'>
              {scopeCounts.all}
            </Tag>
            <Button
              size='small'
              type={scope === 'personal' ? 'primary' : 'outline'}
              onClick={() => applyScope('personal')}
            >
              {t('common.workspace.scopePersonal', { defaultValue: '个人' })}
            </Button>
            <Tag size='small' color='gray'>
              {scopeCounts.personal}
            </Tag>
            <Button
              size='small'
              type={scope === 'team' ? 'primary' : 'outline'}
              onClick={() => applyScope('team')}
            >
              {t('common.workspace.scopeTeam', { defaultValue: '团队协同' })}
            </Button>
            <Tag size='small' color='gray'>
              {scopeCounts.team}
            </Tag>
            {scope === 'team' && scopedTeamName ? (
              <Tag size='small' color='purple'>
                {scopedTeamName}
              </Tag>
            ) : null}
            {scope === 'team' && scopedTeamId ? (
              <Button size='small' type='outline' onClick={() => navigate(`/team/${scopedTeamId}`)}>
                {t('team.backToCurrentTeam', { defaultValue: '返回当前团队' })}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isCurrentTeamScope ? (
        <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--color-text-3)' }}>
          {t('common.workspace.scopeTeamSessionOpenHint', {
            defaultValue: '当前团队视图中的团队会话会直接回到对应的团队协同页。',
          })}
        </div>
      ) : null}

      {scopedIssueId && scopedIssueSubject ? (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
            {t('common.workspace.issueContextHint', {
              defaultValue: '当前来自超级助手 Issue：{{subject}}',
              subject: scopedIssueSubject,
            })}
          </div>
          <Button
            size='small'
            type='outline'
            onClick={() => navigate(buildIssueKanbanPath(scopedIssueId, scopedIssueSubject, scopedTeamId, scopedTeamName))}
          >
            {t('common.workspace.issueOpenKanban', {
              defaultValue: '打开当前 Issue 看板',
            })}
          </Button>
        </div>
      ) : null}

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
          isSearchActive && contentSearchLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Spin />
            </div>
          ) : (
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
                <Button
                  type='primary'
                  icon={<Add theme='outline' />}
                  onClick={handleNewAction}
                >
                  {isCurrentTeamScope
                    ? t('team.continueTeamCollaboration', { defaultValue: '继续团队协同' })
                    : scope === 'team'
                      ? t('team.createTeamSession', { defaultValue: '新建团队会话' })
                      : t('sessions.startFirst')}
                </Button>
              </div>
            )}
          </div>
          )
        ) : (
          <>
            {isSearchActive ? (
              filtered.map((c) => (
                <SessionCard
                  key={c.id}
                  conv={c}
                  onDelete={handleDelete}
                  matchPreview={contentMatchMap.get(c.id)}
                />
              ))
            ) : activeDateKey ? (
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
      <TeamCreateModal
        visible={createTeamVisible}
        onClose={() => setCreateTeamVisible(false)}
        onCreated={(team) => {
          void handleTeamCreated(team);
        }}
      />
    </div>
  );
};

export default SessionsPage;
