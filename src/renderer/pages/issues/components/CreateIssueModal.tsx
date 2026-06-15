import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Message, Select } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import AionModal from '@/renderer/components/base/AionModal';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  createRequirement,
  type RequirementPriority,
  type RequirementStatus,
  type RequirementType,
} from '@/renderer/utils/enterpriseApi/modules';
import { ensureDesktopWebuiRunning } from '@/renderer/utils/ensureDesktopWebui';
import {
  formatPriorityLabel,
  formatStatusLabel,
  formatTypeLabel,
  ISSUE_CREATE_TYPES,
  ISSUE_PRIORITIES,
  ISSUE_STATUS_ORDER,
} from '../issueUtils';
import { useIssueAssigneeOptions } from '../hooks/useIssueAssigneeOptions';

const FormItem = Form.Item;
const TextArea = Input.TextArea;

export type CreateIssueFormValues = {
  type: RequirementType;
  subject: string;
  description: string;
  status: RequirementStatus;
  priority: RequirementPriority;
  assigned_to: string;
  parent_id: string;
};

type CreateIssueModalProps = {
  visible: boolean;
  parentId?: string | null;
  defaultType?: RequirementType;
  onClose: () => void;
  onCreated: (issueId: string) => void;
};

const CreateIssueModal: React.FC<CreateIssueModalProps> = ({
  visible,
  parentId = null,
  defaultType = 'story',
  onClose,
  onCreated,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm<CreateIssueFormValues>();
  const [saving, setSaving] = useState(false);
  const { options: assigneeOptions, loading: assigneesLoading } = useIssueAssigneeOptions(visible);

  useEffect(() => {
    if (!visible) {
      return;
    }
    form.setFieldsValue({
      type: defaultType,
      subject: '',
      description: '',
      status: 'backlog',
      priority: 'medium',
      assigned_to: '',
      parent_id: parentId ?? '',
    });
  }, [defaultType, form, parentId, visible]);

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setSaving(true);
      await ensureDesktopWebuiRunning();
      const result = await createRequirement({
        type: values.type,
        subject: values.subject.trim(),
        description: values.description?.trim() || null,
        status: values.status,
        priority: values.priority,
        assigned_to: values.assigned_to?.trim() || null,
        parent_id: values.parent_id?.trim() || parentId || null,
      });
      Message.success(t('common.issues.createSuccess', { defaultValue: 'Issue 已创建' }));
      onCreated(result.id);
      onClose();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(error, t('common.issues.createFailed', { defaultValue: '创建 Issue 失败' }), {
          webui_unavailable: t('common.issues.webuiRequiredToCreate', {
            defaultValue: 'WebUI 未启动，请先在设置中启动本机 WebUI。',
          }),
          not_authenticated: t('common.issues.personalCreateHint', {
            defaultValue: '无法创建 Issue：请确认本机 WebUI 已启动（设置 → WebUI）。',
          }),
          forbidden: t('common.issues.personalCreateHint', {
            defaultValue: '无法创建 Issue：请确认本机 WebUI 已启动（设置 → WebUI）。',
          }),
          network: t('common.issues.webuiNetworkError', {
            defaultValue: '无法连接本机 WebUI，请检查服务是否已启动。',
          }),
        })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AionModal
      visible={visible}
      onCancel={onClose}
      header={t('common.issues.createTitle', { defaultValue: '新建 Issue' })}
      size='medium'
      footer={
        <div className='flex justify-end gap-8px pt-4px'>
          <Button onClick={onClose}>{t('common.cancel', { defaultValue: '取消' })}</Button>
          <Button type='primary' loading={saving} onClick={() => void handleSubmit()}>
            {t('common.issues.createConfirm', { defaultValue: '创建' })}
          </Button>
        </div>
      }
    >
      <Form form={form} layout='vertical' className='p-20px'>
        <FormItem
          label={t('common.issues.createFieldType', { defaultValue: '类型' })}
          field='type'
          rules={[{ required: true }]}
        >
          <Select renderFormat={(option) => formatTypeLabel((option?.value as RequirementType) ?? 'story', t)}>
            {ISSUE_CREATE_TYPES.map((type) => (
              <Select.Option key={type} value={type}>
                {formatTypeLabel(type, t)}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
        <FormItem
          label={t('common.issues.createFieldSubject', { defaultValue: '标题' })}
          field='subject'
          rules={[
            { required: true, message: t('common.issues.createSubjectRequired', { defaultValue: '请填写标题' }) },
          ]}
        >
          <Input
            placeholder={t('common.issues.createSubjectPlaceholder', { defaultValue: '例如：竞品调研与方案输出' })}
          />
        </FormItem>
        <FormItem label={t('common.issues.createFieldDescription', { defaultValue: '描述' })} field='description'>
          <TextArea
            autoSize={{ minRows: 4, maxRows: 10 }}
            placeholder={t('common.issues.createDescriptionPlaceholder', {
              defaultValue: '补充背景、目标、约束与验收标准…',
            })}
          />
        </FormItem>
        <FormItem label={t('common.issues.propertyStatus', { defaultValue: '状态' })} field='status'>
          <Select renderFormat={(option) => formatStatusLabel((option?.value as RequirementStatus) ?? 'backlog', t)}>
            {ISSUE_STATUS_ORDER.map((status) => (
              <Select.Option key={status} value={status}>
                {formatStatusLabel(status, t)}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
        <FormItem label={t('common.issues.propertyPriority', { defaultValue: '优先级' })} field='priority'>
          <Select renderFormat={(option) => formatPriorityLabel((option?.value as RequirementPriority) ?? 'medium', t)}>
            {ISSUE_PRIORITIES.map((priority) => (
              <Select.Option key={priority} value={priority}>
                {formatPriorityLabel(priority, t)}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
        <FormItem
          label={t('common.issues.propertyAssignee', { defaultValue: '负责人' })}
          field='assigned_to'
          extra={t('common.issues.assigneeHint', {
            defaultValue: '分配给本企业同事后，对方登录企业账号可在「分配给我」筛选中看到该 Issue。',
          })}
        >
          <Select
            allowClear
            loading={assigneesLoading}
            placeholder={t('common.issues.assigneePlaceholder', { defaultValue: '选择团队成员（可选）' })}
          >
            {assigneeOptions.map((member) => (
              <Select.Option key={member.userId} value={member.userId}>
                {member.label}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
        {parentId ? (
          <FormItem field='parent_id' hidden>
            <Input />
          </FormItem>
        ) : null}
      </Form>
    </AionModal>
  );
};

export default CreateIssueModal;
