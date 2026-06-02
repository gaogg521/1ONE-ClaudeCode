import React, { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Input, Message, Spin, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import AionModal from '@/renderer/components/base/AionModal';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TeamAgent } from '@/common/types/teamTypes';
import { useAllCronJobs } from '@/renderer/pages/cron/useCronJobs';
import { formatCronScheduleBrief, listAgentCronJobs } from '../utils/agentAutomationUtils';

export type ManagedAgentRef = {
  teamId: string;
  slotId: string;
  agentName: string;
  agentType: string;
  teamAgent: TeamAgent;
};

type ManageWorkspaceAgentModalProps = {
  visible: boolean;
  agent: ManagedAgentRef | null;
  onClose: () => void;
  onSaveName: (teamId: string, slotId: string, newName: string) => Promise<void>;
  onRunNow: (agent: ManagedAgentRef) => Promise<void>;
  onAddAutomation: (agent: ManagedAgentRef) => void;
  onEditAutomation: (agent: ManagedAgentRef, job: ICronJob) => void;
  onRunAutomation: (job: ICronJob) => Promise<void>;
};

const ManageWorkspaceAgentModal: React.FC<ManageWorkspaceAgentModalProps> = ({
  visible,
  agent,
  onClose,
  onSaveName,
  onRunNow,
  onAddAutomation,
  onEditAutomation,
  onRunAutomation,
}) => {
  const { t } = useTranslation();
  const { jobs, loading, refetch } = useAllCronJobs();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  useEffect(() => {
    if (visible && agent) {
      setName(agent.agentName);
      void refetch();
    }
  }, [agent, refetch, visible]);

  const linkedJobs = useMemo(
    () => (agent ? listAgentCronJobs(jobs, agent.teamId, agent.slotId) : []),
    [agent, jobs]
  );

  const handleSave = async () => {
    if (!agent) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      Message.warning(t('common.superAssistant.editAgentNameRequired', { defaultValue: '请填写智能体名称' }));
      return;
    }
    if (trimmed === agent.agentName) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSaveName(agent.teamId, agent.slotId, trimmed);
      Message.success(t('common.superAssistant.editAgentSuccess', { defaultValue: '智能体已更新' }));
      onClose();
    } catch (error) {
      Message.error(
        error instanceof Error
          ? error.message
          : t('common.superAssistant.editAgentFailed', { defaultValue: '更新智能体失败' })
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRunAutomation = async (job: ICronJob) => {
    setRunningJobId(job.id);
    try {
      await onRunAutomation(job);
    } finally {
      setRunningJobId(null);
    }
  };

  if (!agent) {
    return null;
  }

  return (
    <AionModal
      visible={visible}
      onCancel={onClose}
      header={t('common.superAssistant.editAgentTitle', { defaultValue: '管理智能体' })}
      size='medium'
      footer={
        <div className='flex justify-end gap-8px pt-4px'>
          <Button onClick={onClose}>{t('common.cancel', { defaultValue: '取消' })}</Button>
          <Button type='primary' loading={saving} onClick={() => void handleSave()}>
            {t('common.save', { defaultValue: '保存' })}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-16px p-20px'>
        <div>
          <label className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentName', { defaultValue: '名称' })}
          </label>
          <Input className='mt-6px' value={name} onChange={setName} />
        </div>
        <div>
          <div className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentRuntime', { defaultValue: '运行时' })}
          </div>
          <Tag className='mt-6px' color='arcoblue'>
            {agent.agentType}
          </Tag>
        </div>

        <div className='rd-10px border border-solid border-[var(--color-border-2)] p-12px'>
          <div className='flex items-center justify-between gap-8px flex-wrap'>
            <div className='text-14px font-600 text-t-primary'>
              {t('common.superAssistant.agentAutomationSection', { defaultValue: '自动化' })}
            </div>
            <div className='flex gap-8px flex-wrap'>
              <Button size='mini' type='primary' onClick={() => onAddAutomation(agent)}>
                {t('common.superAssistant.agentAutomationAdd', { defaultValue: '添加定时任务' })}
              </Button>
              <Button size='mini' type='outline' onClick={() => void onRunNow(agent)}>
                {t('common.superAssistant.agentRunNow', { defaultValue: '立即执行' })}
              </Button>
            </div>
          </div>
          <div className='mt-8px text-12px text-t-tertiary'>
            {t('common.superAssistant.agentAutomationSectionDesc', {
              defaultValue: '定时任务会绑定到该智能体；「立即执行」可直接拉起一次运行。',
            })}
          </div>
          <Spin className='w-full mt-12px' loading={loading}>
            {linkedJobs.length === 0 ? (
              <Empty
                description={t('common.superAssistant.agentAutomationEmpty', {
                  defaultValue: '还没有绑定到此智能体的自动化任务',
                })}
              />
            ) : (
              <div className='space-y-10px'>
                {linkedJobs.map((job) => (
                  <div
                    key={job.id}
                    className='flex items-center justify-between gap-10px rd-8px bg-[var(--color-fill-2)] p-10px flex-wrap'
                  >
                    <div className='min-w-0'>
                      <div className='text-13px font-600 text-t-primary'>{job.name}</div>
                      <div className='mt-4px text-12px text-t-tertiary'>{formatCronScheduleBrief(job)}</div>
                    </div>
                    <div className='flex gap-6px flex-wrap'>
                      <Button
                        size='mini'
                        type='primary'
                        loading={runningJobId === job.id}
                        onClick={() => void handleRunAutomation(job)}
                      >
                        {t('common.superAssistant.agentAutomationRun', { defaultValue: '立即运行' })}
                      </Button>
                      <Button size='mini' type='outline' onClick={() => onEditAutomation(agent, job)}>
                        {t('common.superAssistant.agentAutomationEdit', { defaultValue: '编辑' })}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Spin>
        </div>
      </div>
    </AionModal>
  );
};

export default ManageWorkspaceAgentModal;
