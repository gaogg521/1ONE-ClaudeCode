import { Button, Modal } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { type IMcpServer, BUILTIN_IMAGE_GEN_ID } from '@/common/config/storage';
import AddMcpServerModal from '../components/AddMcpServerModal';
import McpServerItem from './McpServerItem';
import {
  useMcpServers,
  useMcpAgentStatus,
  useMcpOperations,
  useMcpConnection,
  useMcpModal,
  useMcpServerCRUD,
  useMcpOAuth,
} from '@/renderer/hooks/mcp';

interface McpManagementProps {
  message: ReturnType<typeof import('@arco-design/web-react').Message.useMessage>[0];
}

const isVisibleMcpServer = (server: IMcpServer) => !(server.builtin === true && server.id === BUILTIN_IMAGE_GEN_ID);

const McpManagement: React.FC<McpManagementProps> = ({ message }) => {
  const { t } = useTranslation();

  // 使用自定义hooks管理各种状态和操作
  const { mcpServers, extensionMcpServers, saveMcpServers } = useMcpServers();
  const visibleMcpServers = React.useMemo(() => mcpServers.filter(isVisibleMcpServer), [mcpServers]);
  const {
    agentInstallStatus,
    setAgentInstallStatus,
    isServerLoading,
    checkAgentInstallStatus,
    checkSingleServerInstallStatus,
  } = useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, message);

  // OAuth hook
  const { oauthStatus, loggingIn, checkOAuthStatus, login } = useMcpOAuth();

  // 当需要认证时的回调
  const handleAuthRequired = React.useCallback(
    (server: IMcpServer) => {
      void checkOAuthStatus(server);
    },
    [checkOAuthStatus]
  );

  const { testingServers, handleTestMcpConnection } = useMcpConnection(
    mcpServers,
    saveMcpServers,
    message,
    handleAuthRequired
  );
  const {
    showMcpModal,
    editingMcpServer,
    deleteConfirmVisible,
    serverToDelete,
    mcpCollapseKey,
    showAddMcpModal,
    showEditMcpModal,
    hideMcpModal,
    showDeleteConfirm,
    hideDeleteConfirm,
    toggleServerCollapse,
  } = useMcpModal();
  const {
    handleAddMcpServer,
    handleBatchImportMcpServers,
    handleEditMcpServer,
    handleDeleteMcpServer,
    handleToggleMcpServer,
  } = useMcpServerCRUD(
    mcpServers,
    saveMcpServers,
    syncMcpToAgents,
    removeMcpFromAgents,
    checkSingleServerInstallStatus,
    setAgentInstallStatus
  );

  // OAuth 登录处理
  const handleOAuthLogin = React.useCallback(
    async (server: IMcpServer) => {
      const result = await login(server);

      if (result.success) {
        message.success(`${server.name}: ${t('settings.mcpOAuthLoginSuccess') || 'Login successful'}`);
        // 登录成功后重新测试连接
        void handleTestMcpConnection(server);
      } else {
        message.error(`${server.name}: ${result.error || t('settings.mcpOAuthLoginFailed') || 'Login failed'}`);
      }
    },
    [login, message, t, handleTestMcpConnection]
  );

  // 包装添加服务器，添加后自动测试连接
  const wrappedHandleAddMcpServer = React.useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const addedServer = await handleAddMcpServer(serverData);
      if (addedServer) {
        // 直接使用返回的服务器对象进行测试，避免闭包问题
        void handleTestMcpConnection(addedServer);
        // 对于 HTTP/SSE 服务器，检查 OAuth 状态
        if (addedServer.transport.type === 'http' || addedServer.transport.type === 'sse') {
          void checkOAuthStatus(addedServer);
        }
        // 修复 #518: 使用实际服务器的 enabled 状态而不是输入数据的状态
        // Fix #518: Use actual server enabled state instead of input data
        // 因为服务器可能在添加过程中被修改，需要使用最终的实际状态
        // The server may be modified during addition, need to use final actual state
        if (addedServer.enabled) {
          void syncMcpToAgents(addedServer, true);
        }
      }
    },
    [handleAddMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  // 包装编辑服务器，编辑后自动测试连接
  const wrappedHandleEditMcpServer = React.useCallback(
    async (
      editingMcpServer: IMcpServer | undefined,
      serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>
    ) => {
      const updatedServer = await handleEditMcpServer(editingMcpServer, serverData);
      if (updatedServer) {
        // 直接使用返回的服务器对象进行测试
        void handleTestMcpConnection(updatedServer);
        // 对于 HTTP/SSE 服务器，检查 OAuth 状态
        if (updatedServer.transport.type === 'http' || updatedServer.transport.type === 'sse') {
          void checkOAuthStatus(updatedServer);
        }
        // 修复 #518: 使用实际服务器的 enabled 状态而不是输入数据的状态
        // Fix #518: Use actual server enabled state instead of input data
        if (updatedServer.enabled) {
          void syncMcpToAgents(updatedServer, true);
        }
      }
    },
    [handleEditMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  // 包装批量导入，导入后自动测试连接
  const wrappedHandleBatchImportMcpServers = React.useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      const addedServers = await handleBatchImportMcpServers(serversData);
      if (addedServers && addedServers.length > 0) {
        addedServers.forEach((server) => {
          void handleTestMcpConnection(server);
          // 对于 HTTP/SSE 服务器，检查 OAuth 状态
          if (server.transport.type === 'http' || server.transport.type === 'sse') {
            void checkOAuthStatus(server);
          }
          if (server.enabled) {
            void syncMcpToAgents(server, true);
          }
        });
      }
    },
    [handleBatchImportMcpServers, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  // 检测可用agents的状态（保留 importMode 用于 Modal）
  const [importMode, setImportMode] = React.useState<'json' | 'oneclick'>('json');

  const allMcpServers = React.useMemo(() => [...mcpServers, ...extensionMcpServers], [mcpServers, extensionMcpServers]);

  // 初始化和变更时刷新所有 MCP 的 agent 安装状态（包含扩展贡献）
  React.useEffect(() => {
    if (allMcpServers.length === 0) {
      setAgentInstallStatus({});
      return;
    }
    void checkAgentInstallStatus(allMcpServers, true);
  }, [allMcpServers, checkAgentInstallStatus, setAgentInstallStatus]);

  // 初始化时检查所有 HTTP/SSE 服务器的 OAuth 状态
  React.useEffect(() => {
    const httpServers = mcpServers.filter((s) => s.transport.type === 'http' || s.transport.type === 'sse');
    if (httpServers.length > 0) {
      httpServers.forEach((server) => {
        void checkOAuthStatus(server);
      });
    }
  }, [mcpServers, checkOAuthStatus]);

  // 删除确认处理
  const handleConfirmDelete = async () => {
    if (!serverToDelete) return;
    hideDeleteConfirm();
    await handleDeleteMcpServer(serverToDelete);
  };

  return (
    <div>
      {/* Header */}
      <div className='flex items-center justify-between mb-12px'>
        <div className='flex items-center gap-8px'>
          <span className='text-14px font-medium text-t-primary'>{t('settings.mcpSettings')}</span>
          {(visibleMcpServers.length + extensionMcpServers.length) > 0 && (
            <span className='text-12px text-t-secondary bg-fill-2 px-6px py-1px rd-full'>
              {visibleMcpServers.length + extensionMcpServers.length}
            </span>
          )}
        </div>
        <Button
          type='primary'
          size='small'
          icon={<Plus size='14' />}
          shape='round'
          onClick={() => {
            setImportMode('json');
            showAddMcpModal();
          }}
        >
          {t('settings.mcpAddServer')}
        </Button>
      </div>

      {/* Server list */}
      <div className='flex flex-col gap-6px'>
        {visibleMcpServers.length === 0 && extensionMcpServers.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-32px gap-8px rd-12px border border-dashed border-[var(--color-border-2)]'>
            <span className='text-24px'>🔌</span>
            <span className='text-14px font-medium text-t-primary'>{t('settings.mcpNoServersFound') || '暂无 MCP 服务器'}</span>
            <span className='text-12px text-t-secondary text-center max-w-280px'>
              {'MCP 服务器可以让 AI 调用外部工具和服务，例如浏览器控制、文件操作、数据库查询等。'}
            </span>
            <Button
              type='outline'
              size='small'
              icon={<Plus size='13' />}
              className='mt-4px'
              onClick={() => { setImportMode('json'); showAddMcpModal(); }}
            >
              {'添加第一个服务器'}
            </Button>
          </div>
        ) : (
          <>
            {visibleMcpServers.map((server) => (
              <McpServerItem
                key={server.id}
                server={server}
                isCollapsed={mcpCollapseKey[server.id] || false}
                agentInstallStatus={agentInstallStatus}
                isServerLoading={isServerLoading}
                isTestingConnection={testingServers[server.id] || false}
                oauthStatus={oauthStatus[server.id]}
                isLoggingIn={loggingIn[server.id]}
                onToggleCollapse={() => toggleServerCollapse(server.id)}
                onTestConnection={handleTestMcpConnection}
                onEditServer={showEditMcpModal}
                onDeleteServer={showDeleteConfirm}
                onToggleServer={handleToggleMcpServer}
                onOAuthLogin={handleOAuthLogin}
              />
            ))}
            {extensionMcpServers.map((server) => (
              <McpServerItem
                key={server.id}
                server={server}
                isCollapsed={mcpCollapseKey[server.id] || false}
                agentInstallStatus={agentInstallStatus}
                isServerLoading={isServerLoading}
                isTestingConnection={false}
                onToggleCollapse={() => toggleServerCollapse(server.id)}
                onTestConnection={handleTestMcpConnection}
                onEditServer={() => {}}
                onDeleteServer={() => {}}
                onToggleServer={() => Promise.resolve()}
                isReadOnly
              />
            ))}
          </>
        )}
      </div>

      <AddMcpServerModal
        visible={showMcpModal}
        server={editingMcpServer}
        onCancel={hideMcpModal}
        onSubmit={
          editingMcpServer
            ? (serverData) => wrappedHandleEditMcpServer(editingMcpServer, serverData)
            : wrappedHandleAddMcpServer
        }
        onBatchImport={wrappedHandleBatchImportMcpServers}
        importMode={importMode}
      />

      <Modal
        title={t('settings.mcpDeleteServer')}
        visible={deleteConfirmVisible}
        onCancel={hideDeleteConfirm}
        onOk={handleConfirmDelete}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <p>{t('settings.mcpDeleteConfirm')}</p>
      </Modal>
    </div>
  );
};

export default McpManagement;
