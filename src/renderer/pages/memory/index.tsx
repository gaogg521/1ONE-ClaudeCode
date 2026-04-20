/**
 * Memory — Claude Code 记忆管理（项目范围可显式绑定仓库根目录）
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Divider, Input, Message, Modal, Select, Space, Spin, Table, Tabs, Tag, Typography } from '@arco-design/web-react';
import { Add, Edit, Delete, FileText, Refresh, FileAddition } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import {
  dialog,
  memory as memoryIpc,
  type MemoryFileEntry,
  type MemoryScopeInfo,
  type ProjectClaudeInfo,
} from '@/common/adapter/ipcBridge';
import styles from './index.module.css';

const TYPE_COLOR: Record<string, string> = {
  user: 'arcoblue',
  feedback: 'orange',
  project: 'green',
  reference: 'purple',
};

function getType(content: string): string {
  const m = content.match(/^type:\s*(\w+)/m);
  return m ? m[1] : 'reference';
}

function getDesc(content: string): string {
  const m = content.match(/^description:\s*(.+?)$/m);
  if (m) return m[1].trim();
  return (
    content
      .replace(/^---[\s\S]*?---\n?/m, '')
      .trim()
      .split('\n')
      .find((l) => l.trim())
      ?.trim()
      .slice(0, 80) ?? ''
  );
}

const MemoryPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('auto');
  const [scope, setScope] = useState<MemoryScopeInfo | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [entries, setEntries] = useState<MemoryFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeLoading, setScopeLoading] = useState(true);
  const [globalContent, setGlobalContent] = useState('');
  const [globalLoading, setGlobalLoading] = useState(false);
  const [projectInfo, setProjectInfo] = useState<ProjectClaudeInfo | null>(null);
  const [projectContent, setProjectContent] = useState('');
  const [projectLoading, setProjectLoading] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editEntry, setEditEntry] = useState<MemoryFileEntry | null>(null);
  const [editContent, setEditContent] = useState('');
  const [newVisible, setNewVisible] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [newContent, setNewContent] = useState('---\nname: \ndescription: \ntype: user\n---\n\n');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);

  const typeLabel = useCallback(
    (key: string) =>
      ({
        user: t('memory.typeUser'),
        feedback: t('memory.typeFeedback'),
        project: t('memory.typeProject'),
        reference: t('memory.typeReference'),
      })[key] ?? key,
    [t]
  );

  const loadScope = useCallback(async () => {
    setScopeLoading(true);
    try {
      const s = await memoryIpc.getScope.invoke();
      setScope(s);
      setPathInput(s.effectiveRoot);
    } catch {
      Message.error(t('memory.loadScopeFailed'));
    } finally {
      setScopeLoading(false);
    }
  }, [t]);

  const loadSuggestions = useCallback(async () => {
    try {
      const roots = await memoryIpc.suggestRoots.invoke();
      setSuggestions(roots ?? []);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await memoryIpc.list.invoke()) ?? [];
      setEntries(data);
    } catch {
      Message.error(t('memory.readFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadGlobal = useCallback(async () => {
    setGlobalLoading(true);
    try {
      setGlobalContent(await memoryIpc.read.invoke({ filename: 'global-claude' }));
    } catch {
      /* ignore */
    } finally {
      setGlobalLoading(false);
    }
  }, []);

  const loadProjectClaude = useCallback(async () => {
    setProjectLoading(true);
    try {
      const info = await memoryIpc.projectClaude.invoke();
      setProjectInfo(info);
      setProjectContent(info.content);
    } catch {
      /* ignore */
    } finally {
      setProjectLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadScope();
    void loadSuggestions();
  }, [loadScope, loadSuggestions]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries, scope?.effectiveRoot]);

  useEffect(() => {
    if (activeTab === 'global') void loadGlobal();
  }, [activeTab, loadGlobal]);

  useEffect(() => {
    if (activeTab === 'project') void loadProjectClaude();
  }, [activeTab, loadProjectClaude, scope?.effectiveRoot]);

  const applyProjectRoot = async (rootPath?: string) => {
    const trimmed = (typeof rootPath === 'string' ? rootPath : pathInput).trim();
    if (!trimmed) {
      Message.warning(t('memory.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      await memoryIpc.setClaudeProjectRoot.invoke({ path: trimmed });
      setPathInput(trimmed);
      Message.success(t('memory.scopeUpdated'));
      await loadScope();
      await loadEntries();
      if (activeTab === 'project') await loadProjectClaude();
    } catch {
      Message.error(t('memory.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const applyProjectRoots = async (rootPath: string | null, extraRoots: string[]) => {
    setSaving(true);
    try {
      await memoryIpc.setClaudeProjectRoots.invoke({ path: rootPath, extraRoots });
      Message.success(t('memory.scopeUpdated'));
      await loadScope();
      await loadEntries();
      if (activeTab === 'project') await loadProjectClaude();
    } catch {
      Message.error(t('memory.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const applyProjectRootPath = async (path: string) => {
    const trimmed = path.trim();
    if (!trimmed) return;
    setPathInput(trimmed);
    await applyProjectRoot(trimmed);
  };

  const addAdditionalRoot = async (extraRoot: string) => {
    if (!extraRoot.trim()) return;
    const trimmed = extraRoot.trim();
    setSaving(true);
    try {
      await applyProjectRoots(scope?.configuredRoot ?? scope?.effectiveRoot ?? '', [
        ...(scope?.additionalRoots ?? []),
        trimmed,
      ]);
    } finally {
      setSaving(false);
    }
  };

  const removeAdditionalRoot = async (rootToRemove: string) => {
    const remaining = (scope?.additionalRoots ?? []).filter((r) => r !== rootToRemove);
    await applyProjectRoots(scope?.configuredRoot ?? scope?.effectiveRoot ?? '', remaining);
  };

  const clearProjectRoot = async () => {
    setSaving(true);
    try {
      await memoryIpc.setClaudeProjectRoot.invoke({ path: null });
      Message.success(t('memory.scopeCleared'));
      await loadScope();
      await loadEntries();
      if (activeTab === 'project') await loadProjectClaude();
    } catch {
      Message.error(t('memory.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const pickProjectFileOrFolder = async () => {
    try {
      const paths = await dialog.showOpen.invoke({
        properties: ['openFile', 'openDirectory'],
        defaultPath: pathInput || scope?.effectiveRoot,
      });
      const first = paths?.[0];
      if (!first) return;
      await applyProjectRootPath(first);
    } catch {
      Message.info(t('memory.pickFolderUnavailable'));
    }
  };

  const pickAdditionalFolder = async () => {
    try {
      const paths = await dialog.showOpen.invoke({
        properties: ['openDirectory'],
        defaultPath: scope?.effectiveRoot || pathInput,
      });
      const first = paths?.[0];
      if (!first) return;
      await addAdditionalRoot(first);
    } catch {
      Message.info(t('memory.pickFolderUnavailable'));
    }
  };

  const handleSaveGlobal = async () => {
    setSaving(true);
    try {
      await memoryIpc.write.invoke({ filename: 'global-claude', content: globalContent });
      Message.success(t('memory.saveGlobalOk'));
    } catch {
      Message.error(t('memory.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProject = async () => {
    setSaving(true);
    try {
      await memoryIpc.writeProjectClaude.invoke({ content: projectContent });
      Message.success(t('memory.saveProjectOk'));
      await loadProjectClaude();
    } catch {
      Message.error(t('memory.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (e: MemoryFileEntry) => {
    setEditEntry(e);
    setEditContent(e.content);
    setEditVisible(true);
  };

  const handleSaveEntry = async () => {
    if (!editEntry) return;
    setSaving(true);
    try {
      await memoryIpc.write.invoke({ filename: editEntry.filename, content: editContent, path: editEntry.path });
      setEditVisible(false);
      await loadEntries();
    } catch {
      Message.error(t('memory.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (e: MemoryFileEntry) => {
    Modal.confirm({
      title: t('memory.deleteTitle'),
      content: t('memory.deleteConfirm', { name: e.name }),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        await memoryIpc.delete.invoke({ filename: e.filename, path: e.path });
        await loadEntries();
      },
    });
  };

  const handleCreate = async () => {
    if (!newFilename.trim()) {
      Message.warning(t('memory.nameRequired'));
      return;
    }
    const fn = newFilename.trim().endsWith('.md') ? newFilename.trim() : `${newFilename.trim()}.md`;
    setSaving(true);
    try {
      await memoryIpc.write.invoke({ filename: fn, content: newContent });
      setNewVisible(false);
      setNewFilename('');
      setNewContent('---\nname: \ndescription: \ntype: user\n---\n\n');
      await loadEntries();
      Message.success(t('memory.createOk'));
    } catch {
      Message.error(t('memory.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const memoryColumns = [
    {
      title: t('memory.colName'),
      dataIndex: 'name',
      render: (v: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText theme='outline' size={14} />
          <span style={{ fontWeight: 500 }}>{v}</span>
        </div>
      ),
    },
    {
      title: t('memory.colType'),
      dataIndex: 'content',
      width: 88,
      render: (v: string) => {
        const ty = getType(v);
        return (
          <Tag size='small' color={TYPE_COLOR[ty] ?? 'gray'}>
            {typeLabel(ty)}
          </Tag>
        );
      },
    },
    {
      title: t('memory.colDesc'),
      dataIndex: 'content',
      render: (v: string) => <span style={{ fontSize: 12, color: 'var(--color-text-2)' }}>{getDesc(v)}</span>,
    },
    {
      title: t('memory.colUpdated'),
      dataIndex: 'updatedAt',
      width: 112,
      render: (v: number) => <span style={{ fontSize: 12 }}>{new Date(v).toLocaleDateString()}</span>,
    },
    {
      title: t('memory.colActions'),
      width: 90,
      render: (_: unknown, record: MemoryFileEntry) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Button type='text' size='mini' icon={<Edit theme='outline' size={13} />} onClick={() => openEdit(record)} />
          <Button
            type='text'
            size='mini'
            status='danger'
            icon={<Delete theme='outline' size={13} />}
            onClick={() => handleDelete(record)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className={styles.page} style={{ padding: '20px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t('memory.title')}</h2>
      </div>

      {scopeLoading ? (
        <div style={{ textAlign: 'center', padding: 24 }}>
          <Spin loading />
        </div>
      ) : (
        <Card
          style={{ marginBottom: 16 }}
          title={<span style={{ fontWeight: 600 }}>{t('memory.scopeTitle')}</span>}
          size='small'
        >
          <Space direction='vertical' size={10} style={{ width: '100%' }}>
            <Typography.Paragraph style={{ margin: 0, fontSize: 12, color: 'var(--color-text-2)' }}>
              {t('memory.scopeHint')}
            </Typography.Paragraph>

            <Space wrap size={8}>
              <Select
                className={styles.scopeSelect}
                placeholder={t('memory.suggested')}
                style={{ minWidth: 240, maxWidth: 420 }}
                allowClear
                options={suggestions.map((p) => ({ label: p, value: p }))}
                onChange={(v) => {
                  if (v) {
                    void applyProjectRootPath(v);
                  }
                }}
              />
              <Input
                style={{ width: 520, maxWidth: '100%' }}
                value={pathInput}
                onChange={setPathInput}
                placeholder={t('memory.pathPlaceholder')}
              />
              <Button size='small' icon={<FileAddition theme='outline' size={14} />} onClick={() => void pickProjectFileOrFolder()}>
                {t('memory.pickProject')}
              </Button>
              <Button type='primary' size='small' loading={saving} onClick={() => void applyProjectRoot()}>
                {t('memory.applyRoot')}
              </Button>
              <Button size='small' icon={<FileAddition theme='outline' size={14} />} onClick={() => void pickAdditionalFolder()}>
                {t('memory.addAdditionalRoot')}
              </Button>
              {scope?.configuredRoot ? (
                <Button size='small' loading={saving} onClick={() => void clearProjectRoot()}>
                  {t('memory.clearOverride')}
                </Button>
              ) : null}
            </Space>

            <Divider style={{ margin: '6px 0' }} />

            <Space direction='vertical' size={4} style={{ fontSize: 12, color: 'var(--color-text-3)' }}>
              <div>
                <Typography.Text style={{ fontSize: 12 }}>{t('memory.effectiveRoot')}:</Typography.Text>{' '}
                <Typography.Text code style={{ fontSize: 11 }}>{scope?.effectiveRoot}</Typography.Text>
              </div>
              <div>
                <Typography.Text style={{ fontSize: 12 }}>{t('memory.memoryDir')}:</Typography.Text>{' '}
                <Typography.Text code style={{ fontSize: 11 }}>{scope?.absoluteMemoryDirs?.[0]}</Typography.Text>
              </div>
              {scope?.additionalRoots?.length ? (
                <div>
                  <Typography.Text style={{ fontSize: 12 }}>{t('memory.additionalRootsTitle')}:</Typography.Text>
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {scope.additionalRoots.map((root) => (
                      <div key={root} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Typography.Text code style={{ fontSize: 11, flex: 1 }}>{root}</Typography.Text>
                        <Button size='mini' status='danger' onClick={() => void removeAdditionalRoot(root)}>
                          {t('memory.remove')}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <Typography.Text style={{ fontSize: 12 }}>
                  {scope?.configuredRoot ? t('memory.configuredOverride') : t('memory.usingWorkDir')}
                </Typography.Text>
                {scope?.configuredRoot ? (
                  <>
                    {' '}
                    <Typography.Text code style={{ fontSize: 11 }}>{scope.configuredRoot}</Typography.Text>
                  </>
                ) : null}
              </div>
            </Space>
          </Space>
        </Card>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 8 }}>
        {activeTab === 'auto' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              size='small'
              icon={<Refresh theme='outline' />}
              loading={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await loadScope();
                await loadSuggestions();
                await loadEntries();
                setRefreshing(false);
              }}
            >
              {t('memory.refresh')}
            </Button>
            <Button type='primary' size='small' icon={<Add theme='outline' />} onClick={() => setNewVisible(true)}>
              {t('memory.addMemory')}
            </Button>
          </div>
        )}
        {activeTab === 'global' && (
          <Button type='primary' size='small' loading={saving} onClick={() => void handleSaveGlobal()}>
            {t('memory.save')}
          </Button>
        )}
        {activeTab === 'project' && projectInfo?.exists && (
          <Button type='primary' size='small' loading={saving} onClick={() => void handleSaveProject()}>
            {t('memory.save')}
          </Button>
        )}
      </div>

      <Tabs activeTab={activeTab} onChange={setActiveTab} style={{ flex: 1 }}>
        <Tabs.TabPane key='auto' title={t('memory.tabAuto')}>
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--color-text-3)' }}>{t('memory.autoHint')}</div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin loading />
            </div>
          ) : (
            <>
              {entries.length > 8 && !showAllEntries && (
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <Button size='small' onClick={() => setShowAllEntries(true)}>
                    {t('memory.showMore')}
                  </Button>
                </div>
              )}
              <Table
                columns={memoryColumns}
                data={showAllEntries ? entries : entries.slice(0, 8)}
                rowKey='path'
                size='small'
                pagination={showAllEntries && entries.length > 8 ? { pageSize: 8 } : false}
                noDataElement={
                  <div style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: '40px 0' }}>
                    {t('memory.emptyAuto')}
                  </div>
                }
              />
            </>
          )}
        </Tabs.TabPane>

        <Tabs.TabPane key='global' title={t('memory.tabGlobal')}>
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--color-text-3)' }}>{t('memory.globalHint')}</div>
          {globalLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin loading />
            </div>
          ) : (
            <>
              <Input.TextArea
                value={globalContent}
                onChange={setGlobalContent}
                rows={16}
                style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
              />
              <Button
                size='small'
                style={{ marginTop: 8 }}
                onClick={() => memoryIpc.openInEditor.invoke({ filename: 'global-claude' })}
              >
                {t('memory.openInEditor')}
              </Button>
            </>
          )}
        </Tabs.TabPane>

        <Tabs.TabPane key='project' title={t('memory.tabProject')}>
          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--color-text-3)' }}>{t('memory.projectHint')}</div>
          {projectLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin loading />
            </div>
          ) : projectInfo?.exists ? (
            <>
              <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--color-text-4)' }}>{projectInfo.path}</div>
              <Input.TextArea
                value={projectContent}
                onChange={setProjectContent}
                rows={16}
                style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }}
              />
              <Button
                size='small'
                style={{ marginTop: 8 }}
                onClick={() => memoryIpc.openInEditor.invoke({ filename: 'project-claude' })}
              >
                {t('memory.openInEditor')}
              </Button>
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--color-text-4)', padding: '40px 0' }}>
              {t('memory.noProjectClaude')}
              <div style={{ marginTop: 8 }}>
                <Button
                  size='small'
                  type='primary'
                  icon={<Add theme='outline' size={13} />}
                  onClick={async () => {
                    await memoryIpc.writeProjectClaude.invoke({ content: '' });
                    await loadProjectClaude();
                  }}
                >
                  {t('memory.create')}
                </Button>
              </div>
            </div>
          )}
        </Tabs.TabPane>
      </Tabs>

      <Modal
        title={t('memory.editMemory', { name: editEntry?.name ?? '' })}
        visible={editVisible}
        onCancel={() => setEditVisible(false)}
        onOk={() => void handleSaveEntry()}
        okText={t('memory.save')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: saving }}
        style={{ width: 600 }}
      >
        <Input.TextArea value={editContent} onChange={setEditContent} rows={14} style={{ fontFamily: 'monospace', fontSize: 12 }} />
      </Modal>

      <Modal
        title={t('memory.newMemory')}
        visible={newVisible}
        onCancel={() => setNewVisible(false)}
        onOk={() => void handleCreate()}
        okText={t('memory.create')}
        cancelText={t('common.cancel')}
        okButtonProps={{ loading: saving }}
        style={{ width: 600 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 6 }}>{t('memory.filename')}</div>
            <Input placeholder='user_role' value={newFilename} onChange={setNewFilename} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 6 }}>{t('memory.content')}</div>
            <Input.TextArea value={newContent} onChange={setNewContent} rows={10} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default MemoryPage;
