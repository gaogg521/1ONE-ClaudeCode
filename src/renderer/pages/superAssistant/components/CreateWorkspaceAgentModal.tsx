import React, { useMemo, useState } from 'react';
import { Button, Input, Message, Radio, Select } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import AionModal from '@/renderer/components/base/AionModal';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import { AgentOptionLabel, agentKey, filterTeamSupportedAgents } from '@/renderer/pages/team/components/agentSelectUtils';
import type { TTeam } from '@/common/types/teamTypes';

export type WorkspaceAgentVisibility = 'workspace' | 'personal';

type CreateWorkspaceAgentModalProps = {
  visible: boolean;
  teams: TTeam[];
  defaultTeamId?: string;
  onClose: () => void;
  onConfirm: (payload: {
    teamId: string;
    agentName: string;
    agentKey: string;
    description: string;
    visibility: WorkspaceAgentVisibility;
  }) => Promise<void>;
};

const CreateWorkspaceAgentModal: React.FC<CreateWorkspaceAgentModalProps> = ({
  visible,
  teams,
  defaultTeamId,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const { cliAgents } = useConversationAgents();
  const [agentName, setAgentName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [visibility, setVisibility] = useState<WorkspaceAgentVisibility>('workspace');
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? '');
  const [saving, setSaving] = useState(false);

  const allAgents = useMemo(() => filterTeamSupportedAgents([...cliAgents]), [cliAgents]);
  const canConfirm = agentName.trim().length > 0 && selectedKey && teamId;

  const handleClose = () => {
    setAgentName('');
    setDescription('');
    setSelectedKey(undefined);
    setVisibility('workspace');
    onClose();
  };

  const handleSubmit = async () => {
    if (!canConfirm || !selectedKey) {
      return;
    }
    setSaving(true);
    try {
      await onConfirm({
        teamId,
        agentName: agentName.trim(),
        agentKey: selectedKey,
        description: description.trim(),
        visibility,
      });
      Message.success(t('common.superAssistant.createAgentSuccess', { defaultValue: '智能体已创建' }));
      handleClose();
    } catch (error) {
      Message.error(
        error instanceof Error
          ? error.message
          : t('common.superAssistant.createAgentFailed', { defaultValue: '创建智能体失败' })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      header={t('common.superAssistant.createAgentTitle', { defaultValue: '创建智能体' })}
      size='medium'
      footer={
        <div className='flex justify-end gap-8px pt-4px'>
          <Button onClick={handleClose}>{t('common.cancel', { defaultValue: '取消' })}</Button>
          <Button type='primary' disabled={!canConfirm} loading={saving} onClick={() => void handleSubmit()}>
            {t('common.superAssistant.createAgentConfirm', { defaultValue: '创建' })}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-16px p-20px'>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.createAgentSubtitle', {
            defaultValue: '为工作区创建一个新的 AI 智能体，可加入团队供成员分配，或作为个人助手使用。',
          })}
        </div>
        <div className='flex flex-col gap-6px'>
          <label className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentName', { defaultValue: '名称' })}
          </label>
          <Input
            value={agentName}
            onChange={setAgentName}
            placeholder={t('common.superAssistant.createAgentNamePlaceholder', {
              defaultValue: '例如：深度研究智能体',
            })}
          />
        </div>
        <div className='flex flex-col gap-6px'>
          <label className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentDescription', { defaultValue: '描述' })}
          </label>
          <Input.TextArea
            value={description}
            onChange={setDescription}
            maxLength={255}
            showWordLimit
            autoSize={{ minRows: 2, maxRows: 4 }}
            placeholder={t('common.superAssistant.createAgentDescriptionPlaceholder', {
              defaultValue: '这个智能体做什么？',
            })}
          />
        </div>
        <div className='flex flex-col gap-8px'>
          <label className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentVisibility', { defaultValue: '可见性' })}
          </label>
          <Radio.Group
            value={visibility}
            onChange={(value) => setVisibility(value as WorkspaceAgentVisibility)}
            className='grid gap-8px md:grid-cols-2'
          >
            <Radio value='workspace'>
              <div>
                <div className='font-600'>{t('common.superAssistant.visibilityWorkspace', { defaultValue: '工作区' })}</div>
                <div className='text-12px text-t-tertiary'>
                  {t('common.superAssistant.visibilityWorkspaceDesc', { defaultValue: '团队成员均可分配' })}
                </div>
              </div>
            </Radio>
            <Radio value='personal'>
              <div>
                <div className='font-600'>{t('common.superAssistant.visibilityPersonal', { defaultValue: '个人' })}</div>
                <div className='text-12px text-t-tertiary'>
                  {t('common.superAssistant.visibilityPersonalDesc', {
                    defaultValue: '仅你和管理员可分配（仍挂在所选团队下）',
                  })}
                </div>
              </div>
            </Radio>
          </Radio.Group>
        </div>
        <div className='flex flex-col gap-6px'>
          <label className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentTeam', { defaultValue: '所属团队' })}
          </label>
          <Select value={teamId || undefined} onChange={(value) => setTeamId(String(value))}>
            {teams.map((team) => (
              <Select.Option key={team.id} value={team.id}>
                {team.name}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div className='flex flex-col gap-6px'>
          <label className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentRuntime', { defaultValue: '运行时' })}
          </label>
          <Select
            placeholder={t('common.superAssistant.createAgentRuntimePlaceholder', { defaultValue: '选择 CLI Agent' })}
            value={selectedKey}
            onChange={setSelectedKey}
            showSearch
            disabled={allAgents.length === 0}
          >
            {allAgents.map((agent) => (
              <Select.Option key={agentKey(agent)} value={agentKey(agent)}>
                <AgentOptionLabel agent={agent} />
              </Select.Option>
            ))}
          </Select>
        </div>
      </div>
    </AionModal>
  );
};

export default CreateWorkspaceAgentModal;
