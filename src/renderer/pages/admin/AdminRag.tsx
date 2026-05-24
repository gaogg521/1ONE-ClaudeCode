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
  InputNumber,
  List,
  Message,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { Delete, Plus, Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { withCsrfToken, getCsrfToken } from '@process/webserver/middleware/csrfClient';
import AdminPageWrapper from './components/AdminPageWrapper';

type RagDocument = {
  id: string;
  title: string;
  content: string;
  created_at?: number;
};

type SearchResult = {
  title: string;
  chunk_index: number;
  content: string;
  score: number;
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

const AdminRag: React.FC = () => {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Index Document Modal
  const [addVisible, setAddVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  // URL Import Modal
  const [urlVisible, setUrlVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [form] = Form.useForm<{ title: string; content: string }>();

  // Semantic Search Playground
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLimit, setSearchLimit] = useState(5);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<RagDocument[]>('/api/admin/rag/documents');
      setDocuments(data ?? []);
    } catch (e) {
      Message.error(
        e instanceof Error ? e.message : t('admin.rag.messages.loadFailed', { defaultValue: '加载文档失败' })
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleAddDocument = useCallback(async () => {
    try {
      const values = await form.validate();
      setAdding(true);
      await apiMutate('/api/admin/rag/documents', 'POST', {
        title: values.title.trim(),
        content: values.content.trim(),
      });
      Message.success(t('admin.rag.messages.addSuccess', { defaultValue: '文档索引成功' }));
      setAddVisible(false);
      form.resetFields();
      await loadDocuments();
    } catch (e) {
      if (e && typeof e === 'object' && 'title' in e) {
        // Form validation error, ignore
        return;
      }
      Message.error(
        e instanceof Error ? e.message : t('admin.rag.messages.addFailed', { defaultValue: '索引文档失败' })
      );
    } finally {
      setAdding(false);
    }
  }, [form, loadDocuments, t]);

  const handleDeleteDocument = useCallback(
    async (id: string) => {
      try {
        await api<void>(`/api/admin/rag/documents/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(withCsrfToken({})),
        });
        Message.success(t('admin.rag.messages.deleteSuccess', { defaultValue: '文档删除成功' }));
        await loadDocuments();
      } catch (e) {
        Message.error(
          e instanceof Error ? e.message : t('admin.rag.messages.deleteFailed', { defaultValue: '删除文档失败' })
        );
      }
    },
    [loadDocuments, t]
  );

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      return;
    }
    setSearching(true);
    try {
      const results = await apiMutate<SearchResult[]>('/api/admin/rag/query', 'POST', {
        query: searchQuery.trim(),
        limit: searchLimit,
      });
      setSearchResults(results ?? []);
    } catch (e) {
      Message.error(
        e instanceof Error ? e.message : t('admin.rag.messages.searchFailed', { defaultValue: '检索失败' })
      );
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchLimit, t]);

  const columns = [
    {
      title: t('admin.rag.table.title', { defaultValue: '标题' }),
      dataIndex: 'title',
      key: 'title',
      width: 240,
      render: (val: string) => <span className='font-600 text-t-primary'>{val}</span>,
    },
    {
      title: t('admin.rag.table.content', { defaultValue: '内容摘要' }),
      dataIndex: 'content',
      key: 'content',
      render: (val: string) => (
        <Typography.Paragraph
          ellipsis={{ rows: 2, showTooltip: true }}
          style={{ marginBottom: 0 }}
          className='text-t-secondary'
        >
          {val}
        </Typography.Paragraph>
      ),
    },
    {
      title: t('admin.rag.table.actions', { defaultValue: '操作' }),
      key: 'actions',
      width: 100,
      render: (_col: unknown, record: RagDocument) => (
        <Popconfirm
          title={t('common.confirmDelete', { defaultValue: '确认删除？' })}
          onOk={() => void handleDeleteDocument(record.id)}
        >
          <Button
            type='text'
            status='danger'
            size='small'
            icon={<Delete theme='outline' size={14} />}
          />
        </Popconfirm>
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
              {t('admin.rag.title', { defaultValue: 'RAG 知识库' })}
            </Typography.Title>
            <Typography.Paragraph type='secondary' style={{ margin: '4px 0 0 0' }}>
              {t('admin.rag.desc', {
                defaultValue: '管理企业级向量化文档。您可以在此上传文档构建私有知识库，并测试检索效果。',
              })}
            </Typography.Paragraph>
          </div>
          <Space wrap>
            <Button type='outline' icon={<Plus />} onClick={() => { document.getElementById('rag-file-input')?.click(); }}>
              {t('admin.rag.uploadFile', { defaultValue: '上传文件' })}
            </Button>
            <input id='rag-file-input' type='file' accept='.md,.txt,.docx,.html,.ts,.tsx,.js,.json,.css' style={{display:'none'}} onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              setAdding(true);
              try {
                const token = getCsrfToken();
                const headers: Record<string,string> = {};
                if (token) headers['x-csrf-token'] = token;
                const res = await fetch('/api/admin/rag/upload', { method:'POST', headers, body: (() => { const fd = new FormData(); fd.append('file', file); return fd; })() });
                const data = await res.json() as {success:boolean;data:{id:string;status:string}};
                if (data?.success) { Message.success(t('admin.rag.uploadSuccess',{defaultValue:'文件上传成功，后台索引导入中'})); await loadDocuments(); } else { Message.error(data?.message || t('admin.rag.uploadFailed',{defaultValue:'上传失败'})); }
              } catch { Message.error(t('admin.rag.uploadFailed',{defaultValue:'上传失败'})); } finally { setAdding(false); (e.target as HTMLInputElement).value = ''; }
            }} />
            <Button type='outline' icon={<Plus />} onClick={() => { setUrlInput(''); setUrlTitle(''); setUrlVisible(true); }}>
              {t('admin.rag.importUrl', { defaultValue: 'URL 导入' })}
            </Button>
            <Button
              type='primary'
              icon={<Plus theme='outline' size={16} />}
              onClick={() => { form.resetFields(); setAddVisible(true); }}
            >
              {t('admin.rag.addDoc', { defaultValue: '粘贴文本' })}
            </Button>
          </Space>
        </div>

        {/* Grid: Left - Documents Table, Right - Search Playground */}
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-24px items-start'>
          <Card
            className='lg:col-span-2'
            title={t('admin.rag.documentsCard', { defaultValue: '已索引的文档' })}
            bordered={false}
          >
            <Table
              loading={loading}
              rowKey='id'
              columns={columns}
              data={documents}
              pagination={{
                pageSize: 10,
                showTotal: true,
                size: 'small',
              }}
            />
          </Card>

          <Card
            title={t('admin.rag.playgroundCard', { defaultValue: '语义检索测试' })}
            bordered={false}
            extra={
              <Space size='small'>
                <Typography.Text type='secondary'>
                  Limit:
                </Typography.Text>
                <InputNumber
                  size='mini'
                  style={{ width: 60 }}
                  value={searchLimit}
                  onChange={(v) => setSearchLimit(v ? Math.max(1, v) : 5)}
                  min={1}
                  max={20}
                />
              </Space>
            }
          >
            <div className='flex flex-col gap-16px'>
              <Input
                addAfter={
                  <Button
                    type='primary'
                    loading={searching}
                    icon={<Search theme='outline' size={16} />}
                    onClick={() => void handleSearch()}
                  />
                }
                placeholder={t('admin.rag.searchPlaceholder', { defaultValue: '输入查询词测试语义匹配...' })}
                value={searchQuery}
                onChange={setSearchQuery}
                onPressEnter={() => void handleSearch()}
              />

              <List
                loading={searching}
                header={<div className='font-600 text-12px'>{t('admin.rag.results', { defaultValue: '检索结果' })}</div>}
                noDataElement={
                  <div className='text-center py-24px text-t-muted text-12px'>
                    {t('admin.rag.noResults', { defaultValue: '暂无检索结果，输入上方查询词开始测试' })}
                  </div>
                }
                dataSource={searchResults}
                render={(item: SearchResult, index) => (
                  <List.Item key={index} className='p-12px border-b border-border-1 last:border-0 bg-fill-1 rounded-4px mb-8px'>
                    <div className='flex justify-between items-start gap-8px mb-4px'>
                      <Typography.Text bold className='truncate max-w-180px text-13px'>
                        {item.title}
                      </Typography.Text>
                      <Tag color='gold' size='small'>
                        {t('admin.rag.score', { defaultValue: '得分' })}: {item.score.toFixed(4)}
                      </Tag>
                    </div>
                    <div className='text-12px text-t-secondary leading-relaxed bg-fill-2 p-8px rounded-2px max-h-120px overflow-y-auto'>
                      {item.content}
                    </div>
                    <div className='text-10px text-t-muted text-right mt-4px'>
                      Chunk #{item.chunk_index}
                    </div>
                  </List.Item>
                )}
              />
            </div>
          </Card>
        </div>

        {/* Add Doc Modal */}
        <Modal
          title={t('admin.rag.modal.addTitle', { defaultValue: '添加新文档' })}
          visible={addVisible}
          onOk={() => void handleAddDocument()}
          okButtonProps={{ loading: adding }}
          onCancel={() => setAddVisible(false)}
          maskClosable={false}
          style={{ width: 640 }}
        >
          <Form form={form} layout='vertical'>
            <Form.Item
              label={t('admin.rag.modal.docTitle', { defaultValue: '文档标题' })}
              field='title'
              rules={[{ required: true, message: t('admin.rag.validation.titleRequired', { defaultValue: '请输入标题' }) }]}
            >
              <Input placeholder={t('admin.rag.modal.titlePlaceholder', { defaultValue: '例如：1ONE企业版部署说明' })} />
            </Form.Item>
            <Form.Item
              label={t('admin.rag.modal.docContent', { defaultValue: '文档内容' })}
              field='content'
              rules={[{ required: true, message: t('admin.rag.validation.contentRequired', { defaultValue: '请输入内容' }) }]}
            >
              <Input.TextArea
                rows={12}
                placeholder={t('admin.rag.modal.contentPlaceholder', {
                  defaultValue: '请输入文档全文，系统会自动对大段文本进行切片并向量化。',
                })}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* URL Import Modal */}
        <Modal
          title={t('admin.rag.urlImportTitle', { defaultValue: 'URL 导入文档' })}
          visible={urlVisible}
          onOk={async () => {
            if (!urlInput.trim()) { Message.warning(t('admin.rag.urlRequired', { defaultValue: '请输入URL' })); return; }
            setAdding(true);
            try {
              const res = await apiMutate<{success:boolean;data:{id:string}}>('/api/admin/rag/import-url', 'POST', { url: urlInput.trim(), title: urlTitle.trim() || undefined });
              if (res?.success) { Message.success(t('admin.rag.urlSuccess', { defaultValue: 'URL 文档导入成功' })); setUrlVisible(false); setUrlInput(''); setUrlTitle(''); await loadDocuments(); }
              else { Message.error(t('admin.rag.urlFailed', { defaultValue: '导入失败' })); }
            } catch { Message.error(t('admin.rag.urlFailed', { defaultValue: '导入失败' })); } finally { setAdding(false); }
          }}
          okButtonProps={{ loading: adding }}
          okText={t('common.import', { defaultValue: '导入' })}
          onCancel={() => setUrlVisible(false)}
          cancelText={t('common.cancel', { defaultValue: '取消' })}
        >
          <Form layout='vertical'>
            <Form.Item label={t('admin.rag.urlLabel', { defaultValue: '文档 URL' })} required>
              <Input value={urlInput} onChange={setUrlInput} placeholder='https://feishu.cn/docx/xxx 或 https://dingtalk.com/...' />
            </Form.Item>
            <Form.Item label={t('admin.rag.urlTitleLabel', { defaultValue: '标题（可选）' })}>
              <Input value={urlTitle} onChange={setUrlTitle} placeholder={t('admin.rag.urlTitlePlaceholder', { defaultValue: '留空则自动从URL提取' })} />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </AdminPageWrapper>
  );
};

export default AdminRag;
