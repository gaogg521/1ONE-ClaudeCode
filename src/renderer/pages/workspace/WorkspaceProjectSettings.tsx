import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, Message, Modal, Typography } from '@arco-design/web-react';
import { Add, Delete, FolderOpen, MessageOne } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import {
  addPinnedProject,
  getProjectDisplayName,
  readPinnedProjects,
  removePinnedProject,
} from '@/renderer/utils/workspace/pinnedProjects';

type ProjectEntry = {
  path: string;
  displayName: string;
  pinned: boolean;
};

const WorkspaceProjectSettings: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupedHistory, conversations } = useConversationHistoryContext();
  const [pinnedProjects, setPinnedProjects] = useState<string[]>(() => readPinnedProjects());
  const [adding, setAdding] = useState(false);

  const historyProjects = useMemo(() => {
    const paths = new Set<string>();
    groupedHistory.timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type !== 'workspace' || !item.workspaceGroup) return;
        paths.add(item.workspaceGroup.workspace);
      });
    });
    conversations.forEach((conversation) => {
      const workspace = conversation.extra?.workspace;
      if (workspace && conversation.extra?.customWorkspace) {
        paths.add(workspace);
      }
    });
    return [...paths];
  }, [conversations, groupedHistory.timelineSections]);

  const projectEntries = useMemo<ProjectEntry[]>(() => {
    const map = new Map<string, ProjectEntry>();
    pinnedProjects.forEach((path) => {
      map.set(path, {
        path,
        displayName: getProjectDisplayName(path),
        pinned: true,
      });
    });
    historyProjects.forEach((path) => {
      if (map.has(path)) return;
      map.set(path, {
        path,
        displayName: getProjectDisplayName(path),
        pinned: false,
      });
    });
    return [...map.values()].toSorted((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [historyProjects, pinnedProjects]);

  const handleAddProject = useCallback(async () => {
    setAdding(true);
    try {
      const selected = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory'] });
      const path = selected?.[0];
      if (!path) return;
      const next = addPinnedProject(path);
      setPinnedProjects(next);
      Message.success(t('workspace.settings.projects.addSuccess', { defaultValue: '项目目录已添加' }));
    } catch (error) {
      console.error('Failed to pick project directory:', error);
      Message.error(t('workspace.settings.projects.addFailed', { defaultValue: '添加项目目录失败' }));
    } finally {
      setAdding(false);
    }
  }, [t]);

  const handleRemoveProject = useCallback(
    (path: string) => {
      Modal.confirm({
        title: t('workspace.settings.projects.removeTitle', { defaultValue: '移除项目目录' }),
        content: t('workspace.settings.projects.removeConfirm', {
          defaultValue: '确定从项目目录列表中移除「{{name}}」吗？这不会删除本地文件夹。',
          name: getProjectDisplayName(path),
        }),
        okButtonProps: { status: 'danger' },
        onOk: () => {
          const next = removePinnedProject(path);
          setPinnedProjects(next);
          Message.success(t('workspace.settings.projects.removeSuccess', { defaultValue: '项目目录已移除' }));
        },
      });
    },
    [t]
  );

  const handleCreateChat = useCallback(
    (path: string) => {
      void navigate('/guid', { state: { workspace: path } });
    },
    [navigate]
  );

  return (
    <div className='space-y-12px'>
      <div className='flex items-start justify-between gap-12px flex-wrap'>
        <div className='min-w-0'>
          <div className='text-15px font-semibold text-t-primary'>
            {t('workspace.settings.projects.title', { defaultValue: '项目目录' })}
          </div>
          <Typography.Paragraph type='secondary' className='mb-0 mt-4px text-12px'>
            {t('workspace.settings.projects.description', {
              defaultValue: '添加本地项目文件夹，创建会话时会将其作为工作区根目录。',
            })}
          </Typography.Paragraph>
        </div>
        <Button type='primary' icon={<Add theme='outline' size='16' />} loading={adding} onClick={() => void handleAddProject()}>
          {t('workspace.settings.projects.add', { defaultValue: '添加项目目录' })}
        </Button>
      </div>

      {projectEntries.length === 0 ? (
        <Empty
          icon={<FolderOpen theme='outline' size='32' />}
          description={
            <div className='space-y-8px text-center'>
              <div className='text-14px text-t-secondary'>
                {t('workspace.settings.projects.empty', { defaultValue: '还没有项目目录' })}
              </div>
              <div className='text-12px text-t-tertiary max-w-420px mx-auto'>
                {t('workspace.settings.projects.emptyHint', {
                  defaultValue: '点击「添加项目目录」选择本地文件夹，或在创建会话时指定工作区后自动出现在这里。',
                })}
              </div>
            </div>
          }
        />
      ) : (
        <div className='grid gap-10px'>
          {projectEntries.map((entry) => (
            <div
              key={entry.path}
              className='flex items-center justify-between gap-12px px-14px py-12px rd-10px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)]'
            >
              <div className='min-w-0'>
                <div className='text-14px font-medium text-t-primary truncate'>{entry.displayName}</div>
                <Typography.Ellipsis className='text-12px text-t-tertiary mt-4px max-w-full'>{entry.path}</Typography.Ellipsis>
              </div>
              <div className='flex items-center gap-8px shrink-0'>
                <Button
                  size='small'
                  type='outline'
                  icon={<MessageOne theme='outline' size='14' />}
                  onClick={() => handleCreateChat(entry.path)}
                >
                  {t('workspace.settings.projects.createChat', { defaultValue: '创建会话' })}
                </Button>
                {entry.pinned ? (
                  <Button
                    size='small'
                    type='text'
                    status='danger'
                    icon={<Delete theme='outline' size='14' />}
                    onClick={() => handleRemoveProject(entry.path)}
                  >
                    {t('common.remove', { defaultValue: '移除' })}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkspaceProjectSettings;
