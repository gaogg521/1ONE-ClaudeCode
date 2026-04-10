/**
 * MCP 服务 — 独立监控页，匹配原始设计原型
 * 复用 useMcpServers + useMcpConnection 真实数据
 */
import React, { useState, useEffect } from 'react';
import { Button, Tag, Modal, Message, Badge } from '@arco-design/web-react';
import { Add, Delete, Refresh, Setting } from '@icon-park/react';
import type { IMcpServer } from '@/common/config/storage';
import { useMcpServers } from '@/renderer/hooks/mcp/useMcpServers';
import { useMcpConnection } from '@/renderer/hooks/mcp/useMcpConnection';
import { useMcpModal } from '@/renderer/hooks/mcp/useMcpModal';
import { useMcpAgentStatus } from '@/renderer/hooks/mcp/useMcpAgentStatus';
import { useMcpOperations } from '@/renderer/hooks/mcp/useMcpOperations';
import { useMcpServerCRUD } from '@/renderer/hooks/mcp/useMcpServerCRUD';
import AddMcpServerModal from '@/renderer/pages/settings/components/AddMcpServerModal';
import { Message as ArcMessage } from '@arco-design/web-react';

function getTransportLabel(server: IMcpServer): string {
  const t = server.transport.type.toUpperCase();
  if (t === 'STREAMABLE-HTTP') return 'HTTP';
  return t;
}

function getStatusTag(server: IMcpServer) {
  if (server.status === 'testing') return <Tag color='orange' size='small'>连接中</Tag>;
  if (server.status === 'connected') return <Tag color='green' size='small'>已连接</Tag>;
  if (server.status === 'error') return <Tag color='red' size='small'>连接失败</Tag>;
  return <Tag color='gray' size='small'>未测试</Tag>;
}

const MCPPage: React.FC = () => {
  const [msg, msgCtx] = ArcMessage.useMessage({ maxCount: 5 });
  const { mcpServers, extensionMcpServers, saveMcpServers } = useMcpServers();
  const { agentInstallStatus, setAgentInstallStatus, checkSingleServerInstallStatus } = useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, msg);
  const { testingServers, handleTestMcpConnection } = useMcpConnection(mcpServers, saveMcpServers, msg, () => {});
  const { showMcpModal, editingMcpServer, deleteConfirmVisible, serverToDelete,
    showAddMcpModal, showEditMcpModal, hideMcpModal, showDeleteConfirm, hideDeleteConfirm } = useMcpModal();
  const { handleAddMcpServer, handleBatchImportMcpServers, handleEditMcpServer, handleDeleteMcpServer, handleToggleMcpServer } = useMcpServerCRUD(
    mcpServers, saveMcpServers, syncMcpToAgents, removeMcpFromAgents, checkSingleServerInstallStatus, setAgentInstallStatus
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const allServers = [...mcpServers.filter(s => !s.builtin), ...extensionMcpServers];

  const wrappedAdd = async (data: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
    const s = await handleAddMcpServer(data);
    if (s) { void handleTestMcpConnection(s); if (data.enabled) void syncMcpToAgents(s, true); }
  };
  const wrappedEdit = async (serverToEdit: IMcpServer | undefined, data: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
    const s = await handleEditMcpServer(serverToEdit, data);
    if (s) { void handleTestMcpConnection(s); if (data.enabled) void syncMcpToAgents(s, true); }
  };
  const wrappedBatch = async (data: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
    const added = await handleBatchImportMcpServers(data);
    if (added) added.forEach(s => { void handleTestMcpConnection(s); if (s.enabled) void syncMcpToAgents(s, true); });
  };

  // Auto-test on load
  useEffect(() => {
    mcpServers.forEach(s => { if (s.enabled && s.status !== 'connected') void handleTestMcpConnection(s); });
  }, []); // eslint-disable-line

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {msgCtx}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>MCP 服务</h2>
        <Button type='primary' size='small' icon={<Add theme='outline' />} onClick={() => showAddMcpModal()}>
          添加服务
        </Button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-2)', color: 'var(--color-text-3)', fontSize: 12 }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>名称</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>传输</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>状态</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>工具</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>范围</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {allServers.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-3)' }}>
                  🔌 暂无 MCP 服务 — 点击「添加服务」注册
                </td>
              </tr>
            )}
            {allServers.map(server => {
              const toolCount = (server as any).tools?.length ?? 0;
              const isExpanded = expandedId === server.id;
              const isReadOnly = extensionMcpServers.some(e => e.id === server.id);
              return (
                <React.Fragment key={server.id}>
                  <tr
                    style={{ borderBottom: '1px solid var(--color-fill-2)', cursor: toolCount > 0 ? 'pointer' : 'default' }}
                    onClick={() => toolCount > 0 && setExpandedId(isExpanded ? null : server.id)}
                  >
                    <td style={{ padding: '12px', fontWeight: 600 }}>{server.name}</td>
                    <td style={{ padding: '12px' }}>
                      <code style={{ fontSize: 11, background: 'var(--color-fill-2)', padding: '2px 6px', borderRadius: 3 }}>
                        {getTransportLabel(server)}
                      </code>
                    </td>
                    <td style={{ padding: '12px' }}>{getStatusTag(server)}</td>
                    <td style={{ padding: '12px' }}>
                      {toolCount > 0 && (
                        <Badge
                          count={toolCount}
                          style={{ background: 'var(--danger)', cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : server.id); }}
                        />
                      )}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Tag color='purple' size='small'>全局</Tag>
                    </td>
                    <td style={{ padding: '12px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Button
                          size='mini' icon={<Refresh size={13} />}
                          loading={testingServers[server.id]}
                          title='重新连接'
                          onClick={() => handleTestMcpConnection(server)}
                        />
                        {!isReadOnly && (
                          <>
                            <Button size='mini' icon={<Setting size={13} />} title='编辑' onClick={() => showEditMcpModal(server)} />
                            <Button size='mini' status='danger' icon={<Delete size={13} />} title='删除' onClick={() => showDeleteConfirm(server.id)} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} style={{ padding: '0 12px 16px 12px', background: 'var(--color-fill-1)' }}>
                        <div style={{ padding: '12px 0' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-2)' }}>
                            {server.name} — 可用工具 ({toolCount})
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {((server as any).tools ?? []).map((tool: any) => (
                              <code key={tool.name ?? tool} style={{ fontSize: 11, background: 'var(--color-fill-2)', padding: '2px 8px', borderRadius: 3 }}>
                                {tool.name ?? tool}
                              </code>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddMcpServerModal
        visible={showMcpModal}
        server={editingMcpServer}
        onCancel={hideMcpModal}
        onSubmit={editingMcpServer ? (data) => wrappedEdit(editingMcpServer, data) : wrappedAdd}
        onBatchImport={wrappedBatch}
        importMode='json'
      />

      <Modal
        title='删除 MCP 服务'
        visible={deleteConfirmVisible}
        onCancel={hideDeleteConfirm}
        onOk={async () => { hideDeleteConfirm(); if (serverToDelete) await handleDeleteMcpServer(serverToDelete); }}
        okButtonProps={{ status: 'danger' }}
        okText='删除' cancelText='取消'
      >
        <p>确认删除此 MCP 服务？</p>
      </Modal>
    </div>
  );
};

export default MCPPage;
