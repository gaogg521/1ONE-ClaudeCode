import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Input, Message, Radio, Select } from '@arco-design/web-react';
import { useBindableSkillOptions, type BindableSkillOption } from '@/renderer/hooks/skills/useBindableSkillOptions';
import { useTranslation } from 'react-i18next';
import AionModal from '@/renderer/components/base/AionModal';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import {
  AgentOptionLabel,
  agentKey,
  filterDigitalEmployeeRuntimeAgents,
} from '@/renderer/pages/team/components/agentSelectUtils';
import type { TTeam } from '@/common/types/teamTypes';
import { useDigitalEmployeeModelOptions } from '../hooks/useDigitalEmployeeModelOptions';
import {
  DOCUMENT_DELIVERABLE_AGENT_NAME,
  DOCUMENT_DELIVERABLE_DESCRIPTION,
  DOCUMENT_DELIVERABLE_INSTRUCTIONS,
  DOCUMENT_DELIVERABLE_SKILL_IDS,
} from '@/common/digitalEmployee/presets/documentDeliverable';
import {
  GAME_SECURITY_EXPERT_DESCRIPTION,
  GAME_SECURITY_EXPERT_INSTRUCTIONS,
  GAME_SECURITY_EXPERT_NAME,
} from '@/common/digitalEmployee/presets/gameSecurityDailyReport';

export type WorkspaceAgentVisibility = 'workspace' | 'personal';

export function resolveInitialAgentVisibility(): WorkspaceAgentVisibility {
  return 'personal';
}

export function canCreateWorkspaceAgent(input: {
  agentName: string;
  agentKey?: string;
  teamId?: string;
  visibility: WorkspaceAgentVisibility;
}): boolean {
  if (!input.agentName.trim() || !input.agentKey) {
    return false;
  }
  return input.visibility === 'personal' || Boolean(input.teamId);
}

type CreateWorkspaceAgentModalProps = {
  visible: boolean;
  teams: TTeam[];
  defaultTeamId?: string;
  workspaceEnabled?: boolean;
  workspaceUnavailableHint?: string;
  onClose: () => void;
  onConfirm: (payload: {
    teamId: string;
    agentName: string;
    agentKey: string;
    description: string;
    visibility: WorkspaceAgentVisibility;
    skillIds: string[];
    preferredModelId?: string;
    providerModelKey?: string;
    instructions?: string;
  }) => Promise<void>;
};

const CreateWorkspaceAgentModal: React.FC<CreateWorkspaceAgentModalProps> = ({
  visible,
  teams,
  defaultTeamId,
  workspaceEnabled = true,
  workspaceUnavailableHint,
  onClose,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const { cliAgents } = useConversationAgents();
  const [agentName, setAgentName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [visibility, setVisibility] = useState<WorkspaceAgentVisibility>(resolveInitialAgentVisibility);
  const [teamId, setTeamId] = useState(defaultTeamId ?? teams[0]?.id ?? '');
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const { options: skillOptions, loading: skillsLoading } = useBindableSkillOptions(visible);
  const [saving, setSaving] = useState(false);
  const visibleRef = useRef(false);

  const allAgents = useMemo(
    () => filterDigitalEmployeeRuntimeAgents([...cliAgents], visibility),
    [cliAgents, visibility]
  );
  const {
    options: modelOptions,
    loading: modelsLoading,
    selectedModelId,
    setSelectedModelId,
    supportsModelPick,
  } = useDigitalEmployeeModelOptions(visible, allAgents, selectedKey);
  const hasTeams = teams.length > 0;
  const canConfirm = canCreateWorkspaceAgent({
    agentName,
    agentKey: selectedKey,
    teamId,
    visibility,
  });

  const canUseWorkspaceVisibility = workspaceEnabled && hasTeams;

  useEffect(() => {
    if (visible && !visibleRef.current) {
      setTeamId(defaultTeamId ?? teams[0]?.id ?? '');
      setVisibility(resolveInitialAgentVisibility());
      setSkillIds([]);
      setInstructions('');
      setSelectedModelId(undefined);
    }
    visibleRef.current = visible;
  }, [defaultTeamId, setSelectedModelId, teams, visible]);

  const renderSkillOption = (skill: BindableSkillOption) =>
    skill.source === 'local'
      ? `${skill.label} (${t('common.skills.localSkill', { defaultValue: '本地技能' })})`
      : `${skill.label} (${t('common.skills.orgSkill', { defaultValue: '团队技能' })})`;

  const handleClose = () => {
    setAgentName('');
    setDescription('');
    setSelectedKey(undefined);
    setSkillIds([]);
    setInstructions('');
    setSelectedModelId(undefined);
    setVisibility(resolveInitialAgentVisibility());
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
        skillIds,
        preferredModelId: selectedModelId,
        providerModelKey: selectedModelId,
        instructions: instructions.trim(),
      });
      Message.success(t('common.superAssistant.createDigitalEmployeeSuccess', { defaultValue: '数字员工已创建' }));
      handleClose();
    } catch (error) {
      Message.error(
        error instanceof Error
          ? error.message
          : t('common.superAssistant.createDigitalEmployeeFailed', { defaultValue: '创建数字员工失败' })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AionModal
      visible={visible}
      onCancel={handleClose}
      header={t('common.superAssistant.createDigitalEmployeeTitle', { defaultValue: '创建数字员工' })}
      size='medium'
      footer={
        <div className='flex justify-end gap-8px pt-4px'>
          <Button onClick={handleClose}>{t('common.cancel', { defaultValue: '取消' })}</Button>
          <Button type='primary' disabled={!canConfirm} loading={saving} onClick={() => void handleSubmit()}>
            {t('common.superAssistant.createDigitalEmployeeConfirm', { defaultValue: '创建' })}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-16px p-20px'>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.createDigitalEmployeeSubtitle', {
            defaultValue:
              '创建可 7×24 自动跟进 Issues 的数字员工；可配置定时任务。个人数字员工仅你管理，加入团队后可作为工作区成员分配。',
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
              defaultValue: '例如：深度研究数字员工',
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
              defaultValue: '这个数字员工负责什么？',
            })}
          />
        </div>
        <div className='flex flex-col gap-8px'>
          <label className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentVisibility', { defaultValue: '可见性' })}
          </label>
          <Radio.Group
            value={visibility}
            onChange={(value) => {
              const next = value as WorkspaceAgentVisibility;
              if (next === 'workspace' && !canUseWorkspaceVisibility) {
                return;
              }
              setVisibility(next);
            }}
            className='grid gap-8px md:grid-cols-2'
          >
            <Radio value='personal'>
              <div>
                <div className='font-600'>
                  {t('common.superAssistant.visibilityPersonal', { defaultValue: '个人' })}
                </div>
                <div className='text-12px text-t-tertiary'>
                  {t('common.superAssistant.visibilityPersonalDesc', {
                    defaultValue: '仅你可管理，可绑定个人自动化',
                  })}
                </div>
              </div>
            </Radio>
            <Radio value='workspace' disabled={!canUseWorkspaceVisibility}>
              <div>
                <div className='font-600'>
                  {t('common.superAssistant.visibilityWorkspace', { defaultValue: '工作区' })}
                </div>
                <div className='text-12px text-t-tertiary'>
                  {canUseWorkspaceVisibility
                    ? t('common.superAssistant.visibilityWorkspaceDesc', { defaultValue: '团队成员均可分配' })
                    : t('common.superAssistant.visibilityWorkspaceDisabledDesc', {
                        defaultValue: '需先加入或创建协同团队',
                      })}
                </div>
              </div>
            </Radio>
          </Radio.Group>
          {!canUseWorkspaceVisibility && workspaceUnavailableHint ? (
            <Alert className='mt-8px' type='info' content={workspaceUnavailableHint} />
          ) : null}
        </div>
        {visibility === 'workspace' ? (
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
        ) : null}
        <div className='flex flex-col gap-6px'>
          <label className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentSkills', { defaultValue: '绑定 Skills' })}
          </label>
          <Select
            mode='multiple'
            allowClear
            loading={skillsLoading}
            value={skillIds}
            onChange={(value) => setSkillIds((value as string[]) ?? [])}
            placeholder={t('common.superAssistant.createAgentSkillsPlaceholder', {
              defaultValue: '选择要注入的能力包（可选）',
            })}
            disabled={!skillsLoading && skillOptions.length === 0}
            showSearch
            filterOption={(input, option) => {
              const optionProps = (option as React.ReactElement<{ value?: string }> | null | undefined)?.props;
              const value = String(optionProps?.value ?? '');
              const skill = skillOptions.find((item) => item.value === value);
              const label = String(skill?.label ?? value).toLowerCase();
              return label.includes(input.trim().toLowerCase());
            }}
          >
            {skillOptions.map((skill) => (
              <Select.Option key={skill.value} value={skill.value}>
                {renderSkillOption(skill)}
              </Select.Option>
            ))}
          </Select>
        </div>
        <div className='text-12px text-t-tertiary'>
          {t('common.superAssistant.createAfterManageHint', {
            defaultValue: '创建后将打开管理面板，可继续配置定时任务、执行模块与 Skills。',
          })}
        </div>
        <div className='flex flex-col gap-6px'>
          <label className='text-13px font-500 text-t-secondary'>
            {t('common.superAssistant.createAgentRuntime', { defaultValue: '运行时 (Agent)' })}
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
          {visibility === 'workspace' && cliAgents.length > allAgents.length ? (
            <div className='text-12px text-t-tertiary'>
              {t('common.superAssistant.createAgentRuntimeTeamLimited', {
                defaultValue:
                  '工作区数字员工目前仅支持已在团队协作中验证的 Agent（如 Claude Code、Codex）。个人数字员工可使用全部已检测 Agent。',
              })}
            </div>
          ) : null}
        </div>
        {supportsModelPick ? (
          <div className='flex flex-col gap-6px'>
            <label className='text-13px font-500 text-t-secondary'>
              {t('common.superAssistant.createAgentModel', { defaultValue: '模型' })}
            </label>
            <Select
              allowClear
              loading={modelsLoading}
              placeholder={t('common.superAssistant.createAgentModelPlaceholder', {
                defaultValue: '选择已安装的模型（可选，默认使用 Agent 全局默认）',
              })}
              value={selectedModelId}
              onChange={(value) => setSelectedModelId(value ? String(value) : undefined)}
            >
              {modelOptions.map((option) => (
                <Select.Option key={option.value} value={option.value}>
                  {option.label}
                </Select.Option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className='flex flex-col gap-6px'>
          <div className='flex items-center justify-between gap-8px flex-wrap'>
            <label className='text-13px font-500 text-t-secondary'>
              {t('common.superAssistant.createAgentInstructions', { defaultValue: '指令' })}
            </label>
            <div className='flex items-center gap-6px flex-wrap'>
              <Button
                size='mini'
                type='outline'
                onClick={() => {
                  setAgentName(DOCUMENT_DELIVERABLE_AGENT_NAME);
                  setDescription(DOCUMENT_DELIVERABLE_DESCRIPTION);
                  setInstructions(DOCUMENT_DELIVERABLE_INSTRUCTIONS);
                  setSkillIds([...DOCUMENT_DELIVERABLE_SKILL_IDS]);
                }}
              >
                {t('common.superAssistant.applyDocumentDeliverableTemplate', {
                  defaultValue: '套用「文档产出专员」模板',
                })}
              </Button>
              <Button
                size='mini'
                type='outline'
                onClick={() => {
                  setAgentName(GAME_SECURITY_EXPERT_NAME);
                  setDescription(GAME_SECURITY_EXPERT_DESCRIPTION);
                  setInstructions(GAME_SECURITY_EXPERT_INSTRUCTIONS);
                }}
              >
                {t('common.superAssistant.applyGameSecurityTemplate', {
                  defaultValue: '套用「游戏安全专家」模板',
                })}
              </Button>
            </div>
          </div>
          <Input.TextArea
            value={instructions}
            onChange={setInstructions}
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder={t('common.superAssistant.createAgentInstructionsPlaceholder', {
              defaultValue: '写下这个数字员工该做什么、关注什么、需要避开什么…',
            })}
          />
        </div>
      </div>
    </AionModal>
  );
};

export default CreateWorkspaceAgentModal;
