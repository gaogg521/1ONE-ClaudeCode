import React, { useCallback, useEffect, useState } from 'react';
import { Form, Input, Message, Modal, Select } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { kanbanApi } from '@/renderer/utils/kanbanApi';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import { listMemberDashboard, type MemberDashboardRecord } from '@/renderer/utils/enterpriseApi/modules';

type AssignableAgent = {
  slotId: string;
  agentName: string;
};

type CreateSharedTaskModalProps = {
  visible: boolean;
  onClose: () => void;
  issueSubject: string;
  issueDescription?: string | null;
  assignableAgents: AssignableAgent[];
  onCreateWithAgent?: (slotId: string, agentName: string) => Promise<void>;
  onCreated?: () => void;
};

const CreateSharedTaskModal: React.FC<CreateSharedTaskModalProps> = ({
  visible,
  onClose,
  issueSubject,
  issueDescription,
  assignableAgents,
  onCreateWithAgent,
  onCreated,
}) => {
  const { t } = useTranslation();
  const [members, setMembers] = useState<MemberDashboardRecord[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subject, setSubject] = useState(issueSubject);
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [agentSlotId, setAgentSlotId] = useState<string>('');

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const rows = await listMemberDashboard();
      setMembers(rows);
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '加载团队成员失败'));
    } finally {
      setLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubject(issueSubject);
    setAssignedTo('');
    setAgentSlotId('');
    void loadMembers();
  }, [issueSubject, loadMembers, visible]);

  const handleSubmit = async () => {
    if (!subject.trim()) {
      Message.warning('请填写任务标题');
      return;
    }
    if (!assignedTo) {
      Message.warning('请选择要分配的成员');
      return;
    }
    setSaving(true);
    try {
      await kanbanApi.create({
        subject: subject.trim(),
        status: 'pending',
        active_form: issueDescription?.trim() || undefined,
        assigned_to: assignedTo,
      });

      if (agentSlotId && onCreateWithAgent) {
        const agent = assignableAgents.find((item) => item.slotId === agentSlotId);
        if (agent) {
          await onCreateWithAgent(agent.slotId, agent.agentName);
        }
      }

      Message.success('共享任务已创建并分配给团队成员');
      onCreated?.();
      onClose();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, '创建共享任务失败'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('common.superAssistant.createSharedTask', { defaultValue: '创建共享任务' })}
      visible={visible}
      onCancel={onClose}
      onOk={() => void handleSubmit()}
      confirmLoading={saving}
      okText={t('common.create', { defaultValue: '创建' })}
      cancelText={t('common.cancel', { defaultValue: '取消' })}
    >
      <Form layout='vertical'>
        <Form.Item label={t('common.superAssistant.sharedTaskSubject', { defaultValue: '任务标题' })} required>
          <Input value={subject} onChange={setSubject} placeholder='例如：整理本周交付指标' />
        </Form.Item>
        <Form.Item label={t('common.superAssistant.sharedTaskAssignee', { defaultValue: '分配给成员' })} required>
          <Select
            value={assignedTo || undefined}
            onChange={(value) => setAssignedTo(String(value))}
            placeholder={loadingMembers ? '加载成员中…' : '选择团队成员'}
            loading={loadingMembers}
            showSearch
            filterOption={(input, option) => {
              const memberId = String((option as { props?: { value?: string } })?.props?.value ?? '');
              const label = members.find((member) => member.id === memberId)?.username ?? '';
              return label.toLowerCase().includes(input.toLowerCase());
            }}
          >
            {members.map((member) => (
              <Select.Option key={member.id} value={member.id}>
                {member.username}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
        {assignableAgents.length > 0 ? (
          <Form.Item
            label={t('common.superAssistant.sharedTaskAgent', { defaultValue: '同时交给 Agent 自动执行（可选）' })}
          >
            <Select
              value={agentSlotId || undefined}
              onChange={(value) => setAgentSlotId(String(value ?? ''))}
              placeholder='选择 Agent 后会在创建任务后自动拉起执行'
              allowClear
            >
              {assignableAgents.map((agent) => (
                <Select.Option key={agent.slotId} value={agent.slotId}>
                  {agent.agentName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
};

export default CreateSharedTaskModal;
