/**
 * Sessions — Claude Code 会话中心（接真实数据）
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Button, Input, Tag, Tooltip, Spin, Empty } from '@arco-design/web-react';
import { Add, Search, Play, Delete } from '@icon-park/react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';

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

const SessionCard: React.FC<{ conv: TChatConversation; onDelete: (id: string) => void }> = ({ conv, onDelete }) => {
  const navigate = useNavigate();
  const backend = getBackendInfo(conv);
  const isRunning = conv.status === 'running';

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
          <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv.name || '未命名会话'}
          </span>
          <Tag size='small' color={backend.color} style={{ flexShrink: 0 }}>{backend.label}</Tag>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
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
  const [convs, setConvs] = useState<TChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
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
        // Sort by modifyTime descending
        filtered.sort((a, b) => b.modifyTime - a.modifyTime);
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

  const filtered = convs.filter((c) =>
    (c.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>会话中心</h2>
        <Button type='primary' icon={<Add theme='outline' />} size='small' onClick={() => navigate('/guid')}>
          新会话
        </Button>
      </div>

      <Input
        prefix={<Search theme='outline' size={14} />}
        placeholder='搜索会话...'
        value={search}
        onChange={setSearch}
        style={{ marginBottom: 16 }}
        allowClear
      />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Spin />
          </div>
        ) : filtered.length === 0 ? (
          <Empty
            description={search ? '没有匹配的会话' : '还没有会话，点击「新会话」开始'}
            style={{ padding: '40px 0' }}
          >
            {!search && (
              <Button type='primary' icon={<Add theme='outline' />} onClick={() => navigate('/guid')}>
                开始第一个会话
              </Button>
            )}
          </Empty>
        ) : (
          filtered.map((c) => <SessionCard key={c.id} conv={c} onDelete={handleDelete} />)
        )}
      </div>
    </div>
  );
};

export default SessionsPage;
