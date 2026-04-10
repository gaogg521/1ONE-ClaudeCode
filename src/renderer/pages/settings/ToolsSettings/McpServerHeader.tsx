import type { IMcpServer } from '@/common/config/storage';
import { Button, Switch, Tooltip, Tag } from '@arco-design/web-react';
import {
  LoadingOne,
  Refresh,
  Write,
  DeleteFour,
  Login,
} from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import McpAgentStatusDisplay from './McpAgentStatusDisplay';
import type { McpOAuthStatus } from '@/renderer/hooks/mcp/useMcpOAuth';

interface McpServerHeaderProps {
  server: IMcpServer;
  agentInstallStatus: Record<string, string[]>;
  isServerLoading: (serverName: string) => boolean;
  isTestingConnection: boolean;
  oauthStatus?: McpOAuthStatus;
  isLoggingIn?: boolean;
  /** Extension-contributed servers are read-only */
  isReadOnly?: boolean;
  onTestConnection: (server: IMcpServer) => void;
  onEditServer: (server: IMcpServer) => void;
  onDeleteServer: (serverId: string) => void;
  onToggleServer: (serverId: string, enabled: boolean) => void;
  onOAuthLogin?: (server: IMcpServer) => void;
}

/** Get transport type label + color for the badge */
function getTransportBadge(server: IMcpServer): { label: string; color: string } {
  const t = server.transport;
  if (t.type === 'http' || t.type === 'streamable_http') return { label: 'HTTP', color: 'blue' };
  if (t.type === 'sse') return { label: 'SSE', color: 'purple' };
  // stdio: detect npx vs node vs python vs direct binary
  if (t.type === 'stdio') {
    const cmd = (t as { command?: string }).command || '';
    if (cmd === 'npx' || cmd === 'bunx') return { label: 'npx', color: 'green' };
    if (cmd === 'python' || cmd === 'python3' || cmd === 'uvx') return { label: 'py', color: 'orange' };
    if (cmd === 'node') return { label: 'node', color: 'arcoblue' };
    return { label: 'stdio', color: 'gray' };
  }
  return { label: 'unknown', color: 'gray' };
}

/** Build a one-line command preview string */
function getCommandPreview(server: IMcpServer): string {
  const t = server.transport;
  if (t.type === 'http' || t.type === 'sse' || t.type === 'streamable_http') {
    return (t as { url?: string }).url || '';
  }
  if (t.type === 'stdio') {
    const s = t as { command?: string; args?: string[] };
    const parts = [s.command, ...(s.args || [])].filter(Boolean);
    const preview = parts.join(' ');
    return preview.length > 60 ? preview.slice(0, 57) + '…' : preview;
  }
  return '';
}

/** Status dot */
function StatusDot({ status, oauthStatus }: { status?: IMcpServer['status']; oauthStatus?: McpOAuthStatus }) {
  if (status === 'testing' || oauthStatus?.isChecking) {
    return <LoadingOne size={14} className='text-primary-6 animate-spin' />;
  }
  if (status === 'error') {
    return <span className='inline-block w-8px h-8px rounded-full bg-red-500 shrink-0' />;
  }
  if (oauthStatus?.needsLogin) {
    return <span className='inline-block w-8px h-8px rounded-full bg-orange-400 shrink-0' />;
  }
  if (status === 'connected' || oauthStatus?.isAuthenticated) {
    return <span className='inline-block w-8px h-8px rounded-full bg-green-500 shrink-0' />;
  }
  return <span className='inline-block w-8px h-8px rounded-full bg-[var(--color-fill-4)] shrink-0' />;
}

function getStatusLabel(status?: IMcpServer['status'], oauthStatus?: McpOAuthStatus): string {
  if (status === 'testing' || oauthStatus?.isChecking) return '检测中';
  if (status === 'error') return '连接失败';
  if (oauthStatus?.needsLogin) return '需要登录';
  if (status === 'connected' || oauthStatus?.isAuthenticated) return '已连接';
  return '未测试';
}

const McpServerHeader: React.FC<McpServerHeaderProps> = ({
  server,
  agentInstallStatus,
  isServerLoading,
  isTestingConnection,
  oauthStatus,
  isLoggingIn,
  isReadOnly,
  onTestConnection,
  onEditServer,
  onDeleteServer,
  onToggleServer,
  onOAuthLogin,
}) => {
  const { t } = useTranslation();
  const badge = getTransportBadge(server);
  const cmdPreview = getCommandPreview(server);
  const statusLabel = getStatusLabel(server.status, oauthStatus);
  const needsLogin = (server.transport.type === 'http' || server.transport.type === 'sse') && oauthStatus?.needsLogin;

  return (
    <div className='flex items-center justify-between w-full min-w-0 gap-8px'>
      {/* Left: name + badges + command */}
      <div className='flex flex-col min-w-0 flex-1 gap-2px'>
        <div className='flex items-center gap-6px min-w-0'>
          <StatusDot status={server.status} oauthStatus={oauthStatus} />
          <span className='text-14px font-medium text-t-primary truncate'>{server.name}</span>
          <Tag size='small' color={badge.color} className='shrink-0 !text-10px !px-4px !py-0 !leading-16px'>
            {badge.label}
          </Tag>
          <span className='text-11px text-t-secondary shrink-0'>{statusLabel}</span>
          {isReadOnly && (
            <McpAgentStatusDisplay
              serverName={server.name}
              agentInstallStatus={agentInstallStatus}
              isLoadingAgentStatus={isServerLoading(server.name)}
              alwaysVisible
            />
          )}
        </div>
        {cmdPreview && (
          <span className='text-11px text-t-secondary font-mono truncate pl-14px' title={cmdPreview}>
            {cmdPreview}
          </span>
        )}
      </div>

      {/* Right: actions + toggle — always visible */}
      <div className='flex items-center gap-6px shrink-0' onClick={(e) => e.stopPropagation()}>
        {!isReadOnly && (
          <>
            {!isReadOnly && (
              <McpAgentStatusDisplay
                serverName={server.name}
                agentInstallStatus={agentInstallStatus}
                isLoadingAgentStatus={isServerLoading(server.name)}
              />
            )}
            {needsLogin && onOAuthLogin ? (
              <Button
                size='mini'
                type='primary'
                icon={<Login size={13} />}
                loading={isLoggingIn}
                onClick={() => onOAuthLogin(server)}
              >
                {t('settings.mcpLogin') || '登录'}
              </Button>
            ) : (
              <Tooltip content={t('settings.mcpTestConnection') || '测试连接'} position='top'>
                <Button
                  size='mini'
                  icon={<Refresh size={13} />}
                  loading={isTestingConnection}
                  onClick={() => onTestConnection(server)}
                />
              </Tooltip>
            )}
            {!server.builtin && (
              <>
                <Tooltip content={t('settings.mcpEditServer') || '编辑'} position='top'>
                  <Button size='mini' icon={<Write size={13} />} onClick={() => onEditServer(server)} />
                </Tooltip>
                <Tooltip content={t('settings.mcpDeleteServer') || '删除'} position='top'>
                  <Button
                    size='mini'
                    status='danger'
                    icon={<DeleteFour size={13} />}
                    onClick={() => onDeleteServer(server.id)}
                  />
                </Tooltip>
              </>
            )}
          </>
        )}
        <Switch
          checked={server.enabled}
          onChange={(checked) => onToggleServer(server.id, checked)}
          size='small'
          disabled={server.status === 'testing'}
        />
      </div>
    </div>
  );
};

export default McpServerHeader;
