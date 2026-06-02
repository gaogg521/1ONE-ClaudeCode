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

const FormItem = Form.Item;
const TextArea = Input.TextArea;

export type CreateIssueFormValues = {
  type: RequirementType;
  subject: string;
  description: string;
  status: RequirementStatus;
  priority: RequirementPriority;
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
      parent_id: parentId ?? '',
    });
  }, [defaultType, form, parentId, visible]);

  const handleSubmit = async () => {
    try {
      const values = await form.validate();
      setSaving(true);
      const result = await createRequirement({
        type: values.type,
        subject: values.subject.trim(),
        description: values.description?.trim() || null,
        status: values.status,
        priority: values.priority,
        parent_id: values.parent_id?.trim() || parentId || null,
      });
      Message.success(t('common.issues.createSuccess', { defaultValue: 'Issue 已创建' }));
      onCreated(result.id);
      onClose();
    } catch (error) {
      Message.error(
        getEnterpriseActionError(error, t('common.issues.createFailed', { defaultValue: '创建 Issue 失败' }))
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
          <Select>
            {(['story', 'task', 'bug', 'feature'] as const).map((type) => (
              <Select.Option key={type} value={type}>
                {type}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
        <FormItem
          label={t('common.issues.createFieldSubject', { defaultValue: '标题' })}
          field='subject'
          rules={[{ required: true, message: t('common.issues.createSubjectRequired', { defaultValue: '请填写标题' }) }]}
        >
          <Input placeholder={t('common.issues.createSubjectPlaceholder', { defaultValue: '例如：竞品调研与方案输出' })} />
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
          <Select>
            {(['backlog', 'planning', 'developing', 'testing', 'completed'] as const).map((status) => (
              <Select.Option key={status} value={status}>
                {status}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
        <FormItem label={t('common.issues.propertyPriority', { defaultValue: '优先级' })} field='priority'>
          <Select>
            {(['low', 'medium', 'high', 'urgent'] as const).map((priority) => (
              <Select.Option key={priority} value={priority}>
                {priority}
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
