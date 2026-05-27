/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
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
import { Alert } from '@arco-design/web-react';
import { Delete, Plus, Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import AdminPageWrapper from './components/AdminPageWrapper';
import ModuleDataState from './components/ModuleDataState';
import ModulePageHeader from './components/ModulePageHeader';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  createRagDocument,
  deleteRagDocument,
  getRagStatus,
  importRagFeishuDocument,
  importRagUrl,
  listRagDocuments,
  queryRagDocuments,
  type RagDocumentRecord,
  type RagSearchResultRecord,
  uploadRagDocument,
} from '@/renderer/utils/enterpriseApi/modules';

type RagDocument = RagDocumentRecord;
type SearchResult = RagSearchResultRecord;

const AdminRag: React.FC = () => {
  const { t } = useTranslation();

  // Index Document Modal
  const [addVisible, setAddVisible] = useState(false);
  const [adding, setAdding] = useState(false);
  // URL Import Modal
  const [urlVisible, setUrlVisible] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [feishuVisible, setFeishuVisible] = useState(false);
  const [feishuUrlInput, setFeishuUrlInput] = useState('');
  const [feishuTitle, setFeishuTitle] = useState('');
  const [form] = Form.useForm<{ title: string; content: string }>();

  // Semantic Search Playground
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLimit, setSearchLimit] = useState(5);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const documentsState = useEnterpriseAsyncData(
    listRagDocuments,
    [],
    t('admin.rag.messages.loadFailed', { defaultValue: '加载文档失败' })
  );

  const ragStatusState = useEnterpriseAsyncData(
    getRagStatus,
    { ready: true, message: '' },
    ''
  );

  const handleAddDocument = useCallback(async () => {
    try {
      const values = await form.validate();
      setAdding(true);
      await createRagDocument({
        title: values.title.trim(),
        content: values.content.trim(),
      });
      Message.success(t('admin.rag.messages.addSuccess', { defaultValue: '文档索引成功' }));
      setAddVisible(false);
      form.resetFields();
      await documentsState.reload();
    } catch (e) {
      if (e && typeof e === 'object' && 'title' in e) {
        // Form validation error, ignore
        return;
      }
      Message.error(getEnterpriseActionError(e, t('admin.rag.messages.addFailed', { defaultValue: '索引文档失败' })));
    } finally {
      setAdding(false);
    }
  }, [documentsState, form, t]);

  const handleDeleteDocument = useCallback(
    async (id: string) => {
      try {
        await deleteRagDocument(encodeURIComponent(id));
        Message.success(t('admin.rag.messages.deleteSuccess', { defaultValue: '文档删除成功' }));
        await documentsState.reload();
      } catch (e) {
        Message.error(getEnterpriseActionError(e, t('admin.rag.messages.deleteFailed', { defaultValue: '删除文档失败' })));
      }
    },
    [documentsState, t]
  );

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      return;
    }
    setSearching(true);
    try {
      const results = await queryRagDocuments({
        query: searchQuery.trim(),
        limit: searchLimit,
      });
      setSearchResults(results ?? []);
    } catch (e) {
      Message.error(getEnterpriseActionError(e, t('admin.rag.messages.searchFailed', { defaultValue: '检索失败' })));
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchLimit, t]);

  const handleUrlImport = useCallback(async () => {
    if (!urlInput.trim()) {
      Message.warning(t('admin.rag.urlRequired', { defaultValue: '请输入URL' }));
      return;
    }

    setAdding(true);
    try {
      await importRagUrl({ url: urlInput.trim(), title: urlTitle.trim() || undefined });
      Message.success(t('admin.rag.urlSuccess', { defaultValue: 'URL 文档导入成功' }));
      setUrlVisible(false);
      setUrlInput('');
      setUrlTitle('');
      await documentsState.reload();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(error, t('admin.rag.urlFailed', { defaultValue: '导入失败' }))
      );
    } finally {
      setAdding(false);
    }
  }, [documentsState, t, urlInput, urlTitle]);

  const handleFeishuImport = useCallback(async () => {
    if (!feishuUrlInput.trim()) {
      Message.warning(t('admin.rag.feishuUrlRequired', { defaultValue: '请输入飞书文档链接' }));
      return;
    }

    setAdding(true);
    try {
      await importRagFeishuDocument({
        url: feishuUrlInput.trim(),
        title: feishuTitle.trim() || undefined,
      });
      Message.success(
        t('admin.rag.feishuSuccess', { defaultValue: '飞书文档已提交导入，后台索引中' })
      );
      setFeishuVisible(false);
      setFeishuUrlInput('');
      setFeishuTitle('');
      await documentsState.reload();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(
          error,
          t('admin.rag.feishuFailed', { defaultValue: '飞书文档导入失败' })
        )
      );
    } finally {
      setAdding(false);
    }
  }, [documentsState, feishuTitle, feishuUrlInput, t]);

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
      key: 'meta',
      render: (_: unknown, record: RagDocument) => (
        <div className='flex flex-col gap-4px'>
          <Typography.Text type='secondary' className='text-12px'>
            {record.file_path || 'memory://text'}
          </Typography.Text>
          <div className='flex gap-6px flex-wrap'>
            <Tag size='small' color={record.status === 'completed' ? 'green' : record.status === 'failed' ? 'red' : 'orange'}>
              {record.status || 'pending'}
            </Tag>
            <Tag size='small' color='arcoblue'>
              chunks: {record.chunk_count ?? 0}
            </Tag>
            <Tag size='small' color='gray'>
              {record.scope || 'personal'}
            </Tag>
          </div>
          {record.status === 'failed' && record.last_error ? (
            <Typography.Text type='error' className='text-12px break-all'>
              {t('admin.rag.table.lastError', {
                defaultValue: '失败原因：{{message}}',
                message: record.last_error,
              })}
            </Typography.Text>
          ) : null}
        </div>
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
        <ModulePageHeader
          title={t('admin.rag.title', { defaultValue: 'RAG 知识库' })}
          description={t('admin.rag.desc', {
            defaultValue: '管理企业级向量化文档。您可以在此上传文档构建私有知识库，并测试检索效果。',
          })}
          actions={
            <>
              <Button type='outline' icon={<Plus />} onClick={() => { document.getElementById('rag-file-input')?.click(); }}>
                {t('admin.rag.uploadFile', { defaultValue: '上传文件' })}
              </Button>
            <input id='rag-file-input' type='file' accept='.md,.txt,.docx,.html,.ts,.tsx,.js,.json,.css' style={{display:'none'}} onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              setAdding(true);
              try {
                await uploadRagDocument(file);
                Message.success(t('admin.rag.uploadSuccess',{defaultValue:'文件上传成功，后台索引导入中'}));
                await documentsState.reload();
              } catch (error) { Message.error(getEnterpriseActionError(error, t('admin.rag.uploadFailed',{defaultValue:'上传失败'}))); } finally { setAdding(false); (e.target as HTMLInputElement).value = ''; }
            }} />
              <Button type='outline' icon={<Plus />} onClick={() => { setUrlInput(''); setUrlTitle(''); setUrlVisible(true); }}>
                {t('admin.rag.importUrl', { defaultValue: 'URL 导入' })}
              </Button>
              <Button
                type='outline'
                icon={<Plus />}
                onClick={() => {
                  setFeishuUrlInput('');
                  setFeishuTitle('');
                  setFeishuVisible(true);
                }}
              >
                {t('admin.rag.importFeishu', { defaultValue: '企业飞书导入' })}
              </Button>
              <Button
                type='primary'
                icon={<Plus theme='outline' size={16} />}
                onClick={() => { form.resetFields(); setAddVisible(true); }}
              >
                {t('admin.rag.addDoc', { defaultValue: '粘贴文本' })}
              </Button>
            </>
          }
        />

        {/* Embedding 模型状态提示 */}
        {!ragStatusState.loading && !ragStatusState.data.ready && (
          <Alert
            type='warning'
            title={t('admin.rag.modelNotReady', { defaultValue: 'Embedding 模型未就绪' })}
            content={t('admin.rag.modelNotReadyDesc', {
              defaultValue: '向量化模型正在初始化或下载中（约 80MB），导入的文档将在模型就绪后自动完成索引。若长时间未就绪，请检查网络连接或查看服务日志。错误信息：{{msg}}',
              msg: ragStatusState.data.message,
            })}
            closable
            className='mb-16px'
          />
        )}

        {/* Grid: Left - Documents Table, Right - Search Playground */}
        <div className='grid grid-cols-1 lg:grid-cols-3 gap-24px items-start'>
          <Card
            className='lg:col-span-2'
            title={t('admin.rag.documentsCard', { defaultValue: '已索引的文档' })}
            bordered={false}
          >
            <ModuleDataState
              loading={documentsState.loading}
              error={documentsState.error}
              empty={documentsState.data.length === 0}
              emptyDescription={t('admin.rag.empty', { defaultValue: '暂无文档，点击上方开始导入。' })}
            >
              <Table
                rowKey='id'
                columns={columns}
                data={documentsState.data}
                pagination={{
                  pageSize: 10,
                  showTotal: true,
                  size: 'small',
                }}
              />
            </ModuleDataState>
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
          onOk={() => void handleUrlImport()}
          okButtonProps={{ loading: adding }}
          okText={t('common.import', { defaultValue: '导入' })}
          onCancel={() => setUrlVisible(false)}
          cancelText={t('common.cancel', { defaultValue: '取消' })}
        >
          <Form layout='vertical'>
            <Form.Item label={t('admin.rag.urlLabel', { defaultValue: '文档 URL' })} required>
              <Input value={urlInput} onChange={setUrlInput} placeholder='https://docs.example.com/guide 或 https://company.wiki/page' />
            </Form.Item>
            <Form.Item label={t('admin.rag.urlTitleLabel', { defaultValue: '标题（可选）' })}>
              <Input value={urlTitle} onChange={setUrlTitle} placeholder={t('admin.rag.urlTitlePlaceholder', { defaultValue: '留空则自动从URL提取' })} />
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          title={t('admin.rag.feishuImportTitle', { defaultValue: '企业飞书文档导入' })}
          visible={feishuVisible}
          onOk={() => void handleFeishuImport()}
          okButtonProps={{ loading: adding }}
          okText={t('common.import', { defaultValue: '导入' })}
          onCancel={() => setFeishuVisible(false)}
          cancelText={t('common.cancel', { defaultValue: '取消' })}
        >
          <Form layout='vertical'>
            <Form.Item label={t('admin.rag.feishuUrlLabel', { defaultValue: '飞书文档链接' })} required>
              <Input
                value={feishuUrlInput}
                onChange={setFeishuUrlInput}
                placeholder='https://sample.feishu.cn/docx/xxx 或 https://sample.feishu.cn/wiki/xxx'
              />
            </Form.Item>
            <Form.Item label={t('admin.rag.feishuTitleLabel', { defaultValue: '标题（可选）' })}>
              <Input
                value={feishuTitle}
                onChange={setFeishuTitle}
                placeholder={t('admin.rag.feishuTitlePlaceholder', { defaultValue: '留空则自动读取飞书文档标题' })}
              />
            </Form.Item>
            <Typography.Text type='secondary' className='text-12px'>
              {t('admin.rag.feishuHint', {
                defaultValue: '该入口会复用企业控制台中已配置的飞书应用凭证，不再走匿名网页抓取。',
              })}
            </Typography.Text>
          </Form>
        </Modal>
      </div>
    </AdminPageWrapper>
  );
};

export default AdminRag;
