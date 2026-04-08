/**
 * MCP — MCP 服务管理
 * 管理 Claude Code 连接的 Model Context Protocol 服务器
 */
import React, { useState } from 'react';
import { Button, Table, Tag, Badge, Tooltip, Modal, Form, Input, Select } from '@arco-design/web-react';
import { Add, Refresh, Delete, SettingOne } from '@icon-park/react';

interface MCPServer {
  id: string;
  name: string;
  transport: 'stdio' | 'http' | 'sse';
  status: 'connected' | 'connecting' | 'disconnected';
  toolCount: number;
  scope: 'user' | 'project';
  command?: string;
  url?: string;
}

interface MCPTool {
  name: string;
  description: string;
}

const MOCK_SERVERS: MCPServer[] = [
  { id: '1', name: 'feishu-mcp', transport: 'stdio', status: 'connected', toolCount: 8, scope: 'user', command: 'python feishu_mcp.py' },
  { id: '2', name: 'github-mcp', transport: 'http', status: 'connected', toolCount: 12, scope: 'user', url: 'http://localhost:3100' },
  { id: '3', name: 'sqlite-mcp', transport: 'stdio', status: 'connecting', toolCount: 0, scope: 'project', command: 'node sqlite-mcp.js' },
];

const MOCK_TOOLS: MCPTool[] = [
  { name: 'notify_group', description: '发送飞书群消息' },
  { name: 'read_doc', description: '读取飞书文档内容' },
  { name: 'append_blocks', description: '向飞书文档追加内容块' },
  { name: 'get_token', description: '获取飞书访问令牌' },
  { name: 'list_members', description: '获取群成员列表' },
  { name: 'send_image', description: '发送图片消息' },
  { name: 'create_doc', description: '新建飞书文档' },
  { name: 'search_messages', description: '搜索群消息历史' },
];

const STATUS_COLOR: Record<string, string> = {
  connected: 'green',
  connecting: 'orange',
  disconnected: 'red',
};

const STATUS_LABEL: Record<string, string> = {
  connected: '已连接',
  connecting: '连接中',
  disconnected: '已断开',
};

const MCPPage: React.FC = () => {
  const [servers] = useState<MCPServer[]>(MOCK_SERVERS);
  const [selectedServer, setSelectedServer] = useState<MCPServer | null>(MOCK_SERVERS[0]);
  const [addVisible, setAddVisible] = useState(false);

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (v: string, record: MCPServer) => (
        <a style={{ fontWeight: 600 }} onClick={() => setSelectedServer(record)}>
          {v}
        </a>
      ),
    },
    {
      title: '传输',
      dataIndex: 'transport',
      render: (v: string) => <Tag size='small'>{v.toUpperCase()}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (v: string) => (
        <Tag size='small' color={STATUS_COLOR[v]}>
          {STATUS_LABEL[v]}
        </Tag>
      ),
    },
    {
      title: '工具',
      dataIndex: 'toolCount',
      render: (v: number, record: MCPServer) => (
        <Badge
          count={v}
          style={{ background: record.status === 'connected' ? '#1890ff' : '#8c8c8c' }}
        />
      ),
    },
    {
      title: '范围',
      dataIndex: 'scope',
      render: (v: string) => <Tag size='small' color={v === 'user' ? 'purple' : 'green'}>{v === 'user' ? '全局' : '项目'}</Tag>,
    },
    {
      title: '操作',
      render: (_: unknown, record: MCPServer) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Tooltip content='重连'>
            <Button type='text' size='mini' icon={<Refresh theme='outline' size={13} />} />
          </Tooltip>
          <Tooltip content='配置'>
            <Button type='text' size='mini' icon={<SettingOne theme='outline' size={13} />} />
          </Tooltip>
          <Tooltip content='删除'>
            <Button type='text' size='mini' status='danger' icon={<Delete theme='outline' size={13} />} />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>MCP 服务</h2>
        <Button type='primary' size='small' icon={<Add theme='outline' />} onClick={() => setAddVisible(true)}>
          添加服务
        </Button>
      </div>

      <Table
        columns={columns}
        data={servers}
        rowKey='id'
        size='small'
        pagination={false}
        rowClassName={(record) => (record.id === selectedServer?.id ? 'arco-table-row-selected' : '')}
        onRow={(record) => ({ onClick: () => setSelectedServer(record) })}
        style={{ marginBottom: 20 }}
      />

      {selectedServer && (
        <div>
          <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 14 }}>
            {selectedServer.name} — 可用工具 ({selectedServer.toolCount})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MOCK_TOOLS.slice(0, selectedServer.toolCount).map((tool) => (
              <Tooltip key={tool.name} content={tool.description}>
                <Tag color='arcoblue' style={{ cursor: 'default' }}>
                  {tool.name}
                </Tag>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      <Modal
        title='添加 MCP 服务'
        visible={addVisible}
        onOk={() => setAddVisible(false)}
        onCancel={() => setAddVisible(false)}
        okText='添加'
        cancelText='取消'
      >
        <Form layout='vertical'>
          <Form.Item label='服务名称' required>
            <Input placeholder='例如: feishu-mcp' />
          </Form.Item>
          <Form.Item label='传输方式' required>
            <Select defaultValue='stdio' options={[
              { label: 'stdio', value: 'stdio' },
              { label: 'HTTP', value: 'http' },
              { label: 'SSE', value: 'sse' },
            ]} />
          </Form.Item>
          <Form.Item label='命令 / URL'>
            <Input placeholder='stdio: python server.py  |  http: http://localhost:3000' />
          </Form.Item>
          <Form.Item label='范围'>
            <Select defaultValue='user' options={[
              { label: '全局 (user)', value: 'user' },
              { label: '项目 (project)', value: 'project' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MCPPage;
