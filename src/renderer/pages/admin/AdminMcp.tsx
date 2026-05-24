/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Message,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { Delete, Edit, Plus } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import AdminPageWrapper from './components/AdminPageWrapper';

type McpConnector = {
  id: string;
  name: string;
  type: 'stdio' | 'sse';
  endpoint: string;
  enabled: boolean;
  hasKeys: boolean;
};

type EnvItem = {
  key: string;
  value: string;
};

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  return fetchWebuiApiJson<T>(path, opts);
}

async function apiMutate<T>(path: string, method: string, payload: Record<string, unknown>): Promise<T> {
  return api<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken(payload)),
  });
}

const AdminMcp: React.FC = () => {
  const { t } = useTranslation();
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mcpType, setMcpType] = useState<'stdio' | 'sse'>('stdio');

  // Form instance
  const [form] = Form.useForm<{
    name: string;
    type: 'stdio' | 'sse';
    endpoint: string;
    enabled: boolean;
  }>();

  // Custom environment variables state
  const [envList, setEnvList] = useState<EnvItem[]>([]);

  const loadConnectors = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<McpConnector[]>('/api/admin/mcp/registry');
      setConnectors(data ?? []);
    } catch (e) {
      Message.error(
        e instanceof Error ? e.message : t('admin.mcp.messages.loadFailed', { defaultValue: '加载 MCP 服务失败' })
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setMcpType('stdio');
    setEnvList([{ key: '', value: '' }]);
    form.resetFields();
    form.setFieldsValue({ type: 'stdio', enabled: true });
    setModalVisible(true);
  };

  const handleOpenEdit = (record: McpConnector) => {
    setEditingId(record.id);
    setMcpType(record.type);
    form.resetFields();
    form.setFieldsValue({
      name: record.name,
      type: record.type,
      endpoint: record.endpoint,
      enabled: record.enabled,
    });

    // For editing, show dynamic env inputs.
    // If it has saved keys, we can prepopulate with empty values and let them see the placeholders.
    if (record.hasKeys) {
      setEnvList([{ key: '', value: '' }]);
    } else {
      setEnvList([{ key: '', value: '' }]);
    }
    setModalVisible(true);
  };

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validate();
      setSaving(true);

      // Convert envList to record object, filtering out empty keys
      const envRecord: Record<string, string> = {};
      for (const item of envList) {
        if (item.key.trim()) {
          envRecord[item.key.trim()] = item.value;
        }
      }

      await apiMutate('/api/admin/mcp/registry', 'POST', {
        ...(editingId ? { id: editingId } : {}),
        name: values.name.trim(),
        type: values.type,
        endpoint: values.endpoint.trim(),
        enabled: values.enabled,
        env: envRecord,
      });

      Message.success(t('admin.mcp.messages.saveSuccess', { defaultValue: 'MCP 服务保存成功' }));
      setModalVisible(false);
      form.resetFields();
      setEnvList([]);
      await loadConnectors();
    } catch (e) {
      if (e && typeof e === 'object' && 'name' in e) {
        // Validation error
        return;
      }
      Message.error(
        e instanceof Error ? e.message : t('admin.mcp.messages.saveFailed', { defaultValue: '保存 MCP 服务失败' })
      );
    } finally {
      setSaving(false);
    }
  }, [editingId, envList, form, loadConnectors, t]);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await api<void>(`/api/admin/mcp/registry/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withCsrfToken({})),
        });
        Message.success(t('admin.mcp.messages.deleteSuccess', { defaultValue: '删除 MCP 服务成功' }));
        await loadConnectors();
      } catch (e) {
        Message.error(
          e instanceof Error ? e.message : t('admin.mcp.messages.deleteFailed', { defaultValue: '删除 MCP 服务失败' })
        );
      }
    },
    [loadConnectors, t]
  );

  const handleToggleStatus = useCallback(
    async (record: McpConnector, checked: boolean) => {
      try {
        await apiMutate('/api/admin/mcp/registry', 'POST', {
          id: record.id,
          name: record.name,
          type: record.type,
          endpoint: record.endpoint,
          enabled: checked,
          env: {}, // Maintain existing env credentials
        });
        Message.success(t('admin.mcp.messages.saveSuccess', { defaultValue: '状态更新成功' }));
        await loadConnectors();
      } catch (e) {
        Message.error(e instanceof Error ? e.message : 'Failed to update status');
      }
    },
    [loadConnectors]
  );

  const handleAddEnvRow = () => {
    setEnvList([...envList, { key: '', value: '' }]);
  };

  const handleRemoveEnvRow = (index: number) => {
    const list = [...envList];
    list.splice(index, 1);
    setEnvList(list);
  };

  const handleEnvChange = (index: number, field: keyof EnvItem, val: string) => {
    const list = [...envList];
    list[index][field] = val;
    setEnvList(list);
  };

  const columns = [
    {
      title: t('admin.mcp.table.name', { defaultValue: '服务名称' }),
      dataIndex: 'name',
      key: 'name',
      render: (val: string) => <span className='font-600 text-t-primary'>{val}</span>,
    },
    {
      title: t('admin.mcp.table.type', { defaultValue: '传输类型' }),
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (val: string) => (
        <Tag color={val === 'sse' ? 'arcoblue' : 'purple'} size='small' className='uppercase'>
          {val}
        </Tag>
      ),
    },
    {
      title: t('admin.mcp.table.endpoint', { defaultValue: '端点 / 命令' }),
      dataIndex: 'endpoint',
      key: 'endpoint',
      render: (val: string) => (
        <code className='text-12px bg-fill-2 px-6px py-2px rounded font-mono text-t-secondary truncate max-w-400px block'>
          {val}
        </code>
      ),
    },
    {
      title: t('admin.mcp.table.enabled', { defaultValue: '状态' }),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (val: boolean, record: McpConnector) => (
        <Switch
          checked={val}
          onChange={(checked) => void handleToggleStatus(record, checked)}
          size='small'
        />
      ),
    },
    {
      title: t('admin.mcp.table.actions', { defaultValue: '操作' }),
      key: 'actions',
      width: 120,
      render: (_col: unknown, record: McpConnector) => (
        <Space size='medium'>
          <Button
            type='text'
            size='small'
            icon={<Edit theme='outline' size={14} />}
            onClick={() => handleOpenEdit(record)}
          >
            {t('admin.mcp.table.edit', { defaultValue: '编辑' })}
          </Button>
          <Popconfirm
            title={t('common.confirmDelete', { defaultValue: '确认删除？' })}
            onOk={() => void handleDelete(record.id)}
          >
            <Button
              type='text'
              status='danger'
              size='small'
              icon={<Delete theme='outline' size={14} />}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <AdminPageWrapper>
      <div className='max-w-1200px mx-auto flex flex-col gap-24px'>
        {/* Header */}
        <div className='flex justify-between items-center flex-wrap gap-12px'>
          <div>
            <Typography.Title heading={4} style={{ margin: 0 }}>
              {t('admin.mcp.title', { defaultValue: 'MCP 代理注册' })}
            </Typography.Title>
            <Typography.Paragraph type='secondary' style={{ margin: '4px 0 0 0' }}>
              {t('admin.mcp.desc', {
                defaultValue: '注册并管理企业内部 Model Context Protocol (MCP) 代理服务器。支持配置 Stdio 或 SSE 服务，并加密托管环境变量。',
              })}
            </Typography.Paragraph>
          </div>
          <Space>
            <Button type='outline' onClick={async () => {
              const json = prompt('粘贴 MCP 工具 JSON 数组:\n[{"name":"工具名","type":"sse","endpoint":"http://..."}]', '[{"name":"Jira Connector","type":"sse","endpoint":"https://jira.example.com/mcp"},{"name":"GitLab Agent","type":"sse","endpoint":"https://gitlab.example.com/mcp"},{"name":"Local DB","type":"stdio","endpoint":"sqlite3"}]');
              if (!json?.trim()) return;
              try {
                const items = JSON.parse(json);
                if (!Array.isArray(items)) { Message.error('必须是JSON数组'); return; }
                const res = await apiMutate<{success:boolean;data:{count:number}}>('/api/admin/mcp/batch', 'POST', { items });
                if (res?.success) { Message.success(`成功导入 ${res.data?.count??items.length} 个MCP工具`); await loadConnectors(); }
              } catch { Message.error('JSON格式错误'); }
            }}>{t('admin.mcp.batchImport', { defaultValue: '批量导入' })}</Button>
            <Button
              type='primary'
              icon={<Plus theme='outline' size={16} />}
              onClick={handleOpenAdd}
          >
            {t('admin.mcp.addConnector', { defaultValue: '注册服务' })}
          </Button>
          </Space>
        </div>

        {/* Connectors Table Card */}
        <Card bordered={false}>
          <Table
            loading={loading}
            rowKey='id'
            columns={columns}
            data={connectors}
            pagination={false}
          />
        </Card>

        {/* Save/Edit Modal */}
        <Modal
          title={
            editingId
              ? t('admin.mcp.modal.titleEdit', { defaultValue: '编辑 MCP 服务' })
              : t('admin.mcp.modal.titleAdd', { defaultValue: '注册新 MCP 服务' })
          }
          visible={modalVisible}
          onOk={() => void handleSave()}
          okButtonProps={{ loading: saving }}
          onCancel={() => setModalVisible(false)}
          maskClosable={false}
          style={{ width: 680 }}
        >
          <Form form={form} layout='vertical'>
            <div className='grid grid-cols-2 gap-16px'>
              <Form.Item
                label={t('admin.mcp.modal.name', { defaultValue: '服务名称' })}
                field='name'
                rules={[{ required: true, message: t('admin.mcp.validation.nameRequired', { defaultValue: '请输入服务名称' }) }]}
              >
                <Input placeholder={t('admin.mcp.modal.namePlaceholder', { defaultValue: '例如：postgres-database-tool' })} />
              </Form.Item>
              <Form.Item
                label={t('admin.mcp.modal.type', { defaultValue: '传输类型' })}
                field='type'
                rules={[{ required: true }]}
              >
                <Radio.Group
                  type='button'
                  onChange={(val) => {
                    setMcpType(val as 'stdio' | 'sse');
                    form.setFieldsValue({ endpoint: '' });
                  }}
                >
                  <Radio value='stdio'>STDIO</Radio>
                  <Radio value='sse'>SSE</Radio>
                </Radio.Group>
              </Form.Item>
            </div>

            <Form.Item
              label={t('admin.mcp.modal.endpoint', { defaultValue: '端点或命令行' })}
              field='endpoint'
              rules={[{ required: true, message: t('admin.mcp.validation.endpointRequired', { defaultValue: '请输入端点地址或启动命令' }) }]}
            >
              <Input
                placeholder={
                  mcpType === 'stdio'
                    ? t('admin.mcp.modal.endpointPlaceholderStdio', { defaultValue: '例如：npx -y @modelcontextprotocol/server-postgres' })
                    : t('admin.mcp.modal.endpointPlaceholderSse', { defaultValue: '例如：http://localhost:3001/sse' })
                }
              />
            </Form.Item>

            <Form.Item
              label={t('admin.mcp.modal.enabled', { defaultValue: '启用状态' })}
              field='enabled'
              triggerPropName='checked'
            >
              <Switch />
            </Form.Item>

            {/* Dynamic Credentials Section */}
            <div className='border-t border-border-1 pt-16px mt-16px'>
              <div className='flex justify-between items-center mb-12px'>
                <Typography.Text bold className='text-14px'>
                  {t('admin.mcp.modal.credentials', { defaultValue: '环境变量凭证 (Credentials)' })}
                </Typography.Text>
                <Button
                  type='outline'
                  size='small'
                  icon={<Plus theme='outline' size={14} />}
                  onClick={handleAddEnvRow}
                >
                  {t('admin.mcp.modal.addEnv', { defaultValue: '添加凭证' })}
                </Button>
              </div>

              {envList.length > 0 ? (
                <div className='flex flex-col gap-12px max-h-240px overflow-y-auto pr-4px'>
                  {envList.map((item, idx) => (
                    <div key={idx} className='flex gap-12px items-center'>
                      <Input
                        style={{ flex: 1 }}
                        placeholder={t('admin.mcp.modal.envKey', { defaultValue: '变量名 (Key, 如 API_KEY)' })}
                        value={item.key}
                        onChange={(v) => handleEnvChange(idx, 'key', v)}
                      />
                      <Input.Password
                        style={{ flex: 2 }}
                        placeholder={
                          editingId && connectors.find((c) => c.id === editingId)?.hasKeys
                            ? t('admin.mcp.modal.envValuePlaceholderSaved', { defaultValue: '****** (保留已保存的值)' })
                            : t('admin.mcp.modal.envValue', { defaultValue: '凭证值 (Value)' })
                        }
                        value={item.value}
                        onChange={(v) => handleEnvChange(idx, 'value', v)}
                      />
                      <Button
                        type='text'
                        status='danger'
                        size='small'
                        icon={<Delete theme='outline' size={14} />}
                        onClick={() => handleRemoveEnvRow(idx)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className='text-center py-16px text-t-muted text-12px bg-fill-1 rounded'>
                  {t('admin.mcp.modal.noEnv', { defaultValue: '无需环境变量凭证' })}
                </div>
              )}
            </div>
          </Form>
        </Modal>
      </div>
    </AdminPageWrapper>
  );
};

export default AdminMcp;
