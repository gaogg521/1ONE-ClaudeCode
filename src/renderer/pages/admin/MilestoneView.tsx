/**
 * CTeam Milestone View — Version planning linked to CTeam epics
 */
import React, { useCallback, useState } from 'react';
import { Button, Card, Drawer, Empty, Form, Input, Message, Modal, Progress, Space, Tag, Typography } from '@arco-design/web-react';
import { Plus, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useEnterpriseAsyncData } from '@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData';
import { getEnterpriseActionError } from '@/renderer/utils/enterpriseApi/client';
import {
  createMilestone,
  listMilestoneEpics,
  listMilestones,
  type MilestoneEpicRecord,
  type MilestoneRecord,
} from '@/renderer/utils/enterpriseApi/modules';
import AdminPageWrapper from '@/renderer/pages/admin/components/AdminPageWrapper';
import ModuleDataState from '@/renderer/pages/admin/components/ModuleDataState';
import ModulePageHeader from '@/renderer/pages/admin/components/ModulePageHeader';

const MilestoneView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', due_date: '' });
  const [saving, setSaving] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneRecord | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [epics, setEpics] = useState<MilestoneEpicRecord[]>([]);
  const [epicsLoading, setEpicsLoading] = useState(false);

  const milestonesState = useEnterpriseAsyncData(
    listMilestones,
    [],
    t('common.milestones.loadFailed', { defaultValue: '加载里程碑失败' })
  );

  const loadEpics = useCallback(async (milestoneId: string) => {
    setEpicsLoading(true);
    try {
      const rows = await listMilestoneEpics(milestoneId);
      setEpics(rows);
    } catch (error) {
      Message.error(getEnterpriseActionError(error, t('common.milestones.epicsLoadFailed', { defaultValue: '加载 Epic 失败' })));
      setEpics([]);
    } finally {
      setEpicsLoading(false);
    }
  }, [t]);

  const openMilestoneDetail = useCallback(
    (milestone: MilestoneRecord) => {
      setSelectedMilestone(milestone);
      setDetailVisible(true);
      void loadEpics(milestone.id);
    },
    [loadEpics]
  );

  const handleCreate = async () => {
    if (!form.name.trim()) {
      Message.warning(t('common.milestones.nameRequired', { defaultValue: '版本名称不能为空' }));
      return;
    }
    if (form.due_date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(form.due_date.trim())) {
      Message.warning(t('common.milestones.dateFormat', { defaultValue: '截止日期格式需为 YYYY-MM-DD' }));
      return;
    }
    setSaving(true);
    try {
      await createMilestone({
        ...form,
        due_date: form.due_date.trim(),
      });
      Message.success(t('common.createSuccess', { defaultValue: '创建成功' }));
      setModalVisible(false);
      setForm({ name: '', description: '', due_date: '' });
      await milestonesState.reload();
    } catch (error) {
      Message.error(getEnterpriseActionError(error, t('common.createFailed', { defaultValue: '创建失败' })));
    } finally {
      setSaving(false);
    }
  };

  const now = Date.now();

  return (
    <AdminPageWrapper>
      <ModulePageHeader
        title={t('common.milestones.pageTitle', { defaultValue: '版本规划 Milestones' })}
        description={t('common.milestones.pageDesc', {
          defaultValue: 'Epic 在 CTeam 看板绑定版本里程碑后，此处自动统计完成进度。',
        })}
        actions={
          <>
            <Button icon={<Refresh />} onClick={() => void milestonesState.reload()}>
              {t('common.refresh', { defaultValue: '刷新' })}
            </Button>
            <Button type='primary' icon={<Plus />} onClick={() => setModalVisible(true)}>
              {t('common.milestones.create', { defaultValue: '新建里程碑' })}
            </Button>
          </>
        }
      />
      <ModuleDataState
        loading={milestonesState.loading}
        error={milestonesState.error}
        empty={milestonesState.data.length === 0}
        emptyDescription={t('common.milestones.empty', { defaultValue: '暂无版本里程碑' })}
      >
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-16px'>
          {milestonesState.data.map((m) => {
            const progress = m.epic_count > 0 ? Math.round((m.completed_count / m.epic_count) * 100) : 0;
            // due_date 是 'YYYY-MM-DD' 字符串，new Date() 会解析为 UTC 00:00，在 UTC+8 会提前 8 小时误判逾期。
            // 改为本地当天 23:59:59 比较，截止日内不算逾期。
            const isOverdue = m.due_date
              ? new Date(`${m.due_date}T23:59:59`).getTime() < now
              : false;
            return (
              <Card
                key={m.id}
                bordered={false}
                className='rd-12px hover:-translate-y-2px transition-all cursor-pointer'
                style={{
                  borderLeft: `4px solid ${progress === 100 ? 'rgb(var(--success-6))' : isOverdue ? 'rgb(var(--danger-6))' : 'rgb(var(--primary-6))'}`,
                }}
                onClick={() => openMilestoneDetail(m)}
              >
                <div className='flex items-center justify-between mb-6px'>
                  <Typography.Text bold className='text-15px'>
                    {m.name}
                  </Typography.Text>
                  <Tag color={progress === 100 ? 'green' : isOverdue ? 'red' : 'arcoblue'}>
                    {progress === 100
                      ? t('common.milestones.statusDone', { defaultValue: '已完成' })
                      : isOverdue
                        ? t('common.milestones.statusOverdue', { defaultValue: '已逾期' })
                        : t('common.milestones.statusActive', { defaultValue: '进行中' })}
                  </Tag>
                </div>
                {m.description ? (
                  <Typography.Paragraph type='secondary' className='text-12px mb-8px'>
                    {m.description}
                  </Typography.Paragraph>
                ) : null}
                <div className='flex items-center justify-between text-12px text-t-tertiary mb-8px'>
                  <span>
                    {t('common.milestones.dueLabel', { defaultValue: '截止' })}: {m.due_date || '—'}
                  </span>
                  <span>
                    {m.completed_count}/{m.epic_count} Epic
                  </span>
                </div>
                <Progress
                  percent={progress}
                  size='small'
                  color={progress === 100 ? 'rgb(var(--success-6))' : isOverdue ? 'rgb(var(--danger-6))' : undefined}
                />
              </Card>
            );
          })}
        </div>
      </ModuleDataState>

      <Drawer
        width={480}
        title={selectedMilestone?.name}
        visible={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={
          <Space>
            <Button onClick={() => void navigate('/issues')}>
              {t('common.milestones.openCteam', { defaultValue: '在 Issues 中查看 Epic' })}
            </Button>
            <Button
              type='primary'
              onClick={() => {
                if (selectedMilestone) {
                  void loadEpics(selectedMilestone.id);
                  void milestonesState.reload();
                }
              }}
            >
              {t('common.refresh', { defaultValue: '刷新' })}
            </Button>
          </Space>
        }
      >
        {selectedMilestone ? (
          <>
            <Typography.Paragraph type='secondary' className='text-12px'>
              {t('common.milestones.detailHint', {
                defaultValue: '在 CTeam 史诗列表中为 Epic 选择本里程碑，进度将自动汇总到此版本。',
              })}
            </Typography.Paragraph>
            {epicsLoading ? (
              <Typography.Text type='secondary'>{t('common.loading', { defaultValue: '请稍候...' })}</Typography.Text>
            ) : epics.length === 0 ? (
              <Empty description={t('common.milestones.noEpics', { defaultValue: '尚未绑定 Epic' })} />
            ) : (
              <div className='flex flex-col gap-10px'>
                {epics.map((epic) => (
                  <Card key={epic.id} size='small' bordered className='rd-8px'>
                    <div className='flex items-center justify-between gap-8px'>
                      <Typography.Text bold>{epic.subject}</Typography.Text>
                      <Tag>{epic.status}</Tag>
                    </div>
                    <Button
                      type='text'
                      size='mini'
                      className='mt-6px px-0'
                      onClick={() => void navigate(`/issues/${encodeURIComponent(epic.id)}`)}
                    >
                      {t('common.milestones.openInSuperAssistant', { defaultValue: '在 Issues 中查看' })}
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : null}
      </Drawer>

      <Modal
        title={t('common.milestones.create', { defaultValue: '新建里程碑' })}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => void handleCreate()}
        confirmLoading={saving}
        okText={t('common.create', { defaultValue: '创建' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
      >
        <Form layout='vertical'>
          <Form.Item label={t('common.milestones.nameLabel', { defaultValue: '版本名称' })} required>
            <Input value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} placeholder='v1.11.0' />
          </Form.Item>
          <Form.Item label={t('common.milestones.descriptionLabel', { defaultValue: '描述' })}>
            <Input.TextArea value={form.description} onChange={(v) => setForm((s) => ({ ...s, description: v }))} />
          </Form.Item>
          <Form.Item label={t('common.milestones.dueLabel', { defaultValue: '截止日期' })}>
            <Input
              value={form.due_date}
              onChange={(value) => setForm((s) => ({ ...s, due_date: value }))}
              placeholder='YYYY-MM-DD'
            />
          </Form.Item>
        </Form>
      </Modal>
    </AdminPageWrapper>
  );
};

export default MilestoneView;
