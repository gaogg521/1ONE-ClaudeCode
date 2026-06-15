import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Spin, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { SkillMetadata } from '@/common/types/skillMetadata';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { listSkills, type SkillRecord } from '@/renderer/utils/enterpriseApi/modules';

const SkillDetailPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { skillKey } = useParams<{ skillKey: string }>();
  const { can } = useEditionFeatures();
  const canUseOrgSkills = can('skills.org');
  const [loading, setLoading] = useState(true);
  const [localSkills, setLocalSkills] = useState<SkillMetadata[]>([]);
  const [orgSkills, setOrgSkills] = useState<SkillRecord[]>([]);
  const [localContent, setLocalContent] = useState<string>('');

  useEffect(() => {
    let disposed = false;
    if (!skillKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void Promise.allSettled([
      ipcBridge.fs.listAvailableSkills.invoke(),
      canUseOrgSkills ? listSkills() : Promise.resolve([]),
    ]).then(async ([localResult, orgResult]) => {
      if (disposed) {
        return;
      }
      const nextLocalSkills = localResult.status === 'fulfilled' ? (localResult.value ?? []) : [];
      const nextOrgSkills = orgResult.status === 'fulfilled' ? (orgResult.value ?? []) : [];
      setLocalSkills(nextLocalSkills);
      setOrgSkills(nextOrgSkills);

      const decodedKey = decodeURIComponent(skillKey);
      if (!decodedKey.startsWith('org__')) {
        const localSkill = nextLocalSkills.find((item) => item.name === decodedKey);
        if (localSkill) {
          try {
            const content = await ipcBridge.fs.readFile.invoke({ path: localSkill.location });
            if (!disposed) {
              setLocalContent(content || '');
            }
          } catch {
            if (!disposed) {
              setLocalContent('');
            }
          }
        }
      }

      if (!disposed) {
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
    };
  }, [canUseOrgSkills, skillKey]);

  const resolvedSkill = useMemo(() => {
    if (!skillKey) {
      return null;
    }
    const decodedKey = decodeURIComponent(skillKey);
    if (decodedKey.startsWith('org__')) {
      const orgId = decodedKey.replace(/^org__/, '');
      const orgSkill = orgSkills.find((item) => item.id === orgId);
      return orgSkill ? { source: 'org' as const, orgSkill } : null;
    }
    const localSkill = localSkills.find((item) => item.name === decodedKey);
    return localSkill ? { source: 'local' as const, localSkill } : null;
  }, [localSkills, orgSkills, skillKey]);

  return (
    <PageContentShell className='skill-detail-shell' contentClassName='max-w-1400px pb-40px'>
      <div className='flex items-center gap-8px text-12px text-t-tertiary'>
        <Button size='mini' type='text' onClick={() => navigate('/skills')}>
          {t('common.skills.title', { defaultValue: 'Skills' })}
        </Button>
        <span>/</span>
        <span>
          {resolvedSkill?.source === 'local'
            ? resolvedSkill.localSkill.name
            : (resolvedSkill?.orgSkill.name ?? skillKey)}
        </span>
      </div>

      <Spin className='w-full mt-16px' loading={loading}>
        {!resolvedSkill ? (
          <Card className='mt-16px'>
            <Empty
              description={t('common.skills.notFound', {
                defaultValue: '没有找到这个 Skill，可能尚未安装或已被删除。',
              })}
            />
          </Card>
        ) : (
          <div className='mt-16px grid gap-16px xl:grid-cols-[minmax(0,1fr)_320px]'>
            <div className='space-y-16px'>
              <Card>
                <div className='flex items-start justify-between gap-12px flex-wrap'>
                  <div className='min-w-0 flex-1'>
                    <div className='flex items-center gap-8px flex-wrap'>
                      <div className='text-24px font-700 text-t-primary'>
                        {resolvedSkill.source === 'local' ? resolvedSkill.localSkill.name : resolvedSkill.orgSkill.name}
                      </div>
                      <Tag color={resolvedSkill.source === 'local' ? 'arcoblue' : 'purple'}>
                        {resolvedSkill.source === 'local'
                          ? t('common.skills.localSkill', { defaultValue: '本地技能' })
                          : t('common.skills.orgSkill', { defaultValue: '团队技能' })}
                      </Tag>
                    </div>
                    <Typography.Paragraph className='mt-12px mb-0 text-14px text-t-secondary whitespace-pre-wrap'>
                      {resolvedSkill.source === 'local'
                        ? resolvedSkill.localSkill.description
                        : resolvedSkill.orgSkill.description ||
                          t('common.skills.noDescription', { defaultValue: '当前还没有补充描述。' })}
                    </Typography.Paragraph>
                  </div>
                  <div className='flex items-center gap-8px flex-wrap'>
                    <Button size='small' type='outline' onClick={() => navigate('/settings/skills-hub')}>
                      {t('common.skills.openHub', { defaultValue: '打开 Skills Hub' })}
                    </Button>
                    {resolvedSkill.source === 'org' && canUseOrgSkills ? (
                      <Button size='small' type='primary' onClick={() => navigate('/enterprise/skills')}>
                        {t('common.skills.openAdmin', { defaultValue: '打开团队技能后台' })}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>

              <Card title={t('common.skills.contentTitle', { defaultValue: '内容预览' })}>
                <Typography.Paragraph className='mb-0 text-13px text-t-secondary whitespace-pre-wrap break-words'>
                  {resolvedSkill.source === 'local'
                    ? localContent || t('common.skills.noContent', { defaultValue: '当前无法读取 SKILL.md 内容。' })
                    : resolvedSkill.orgSkill.content ||
                      t('common.skills.noContent', { defaultValue: '当前无法读取 SKILL.md 内容。' })}
                </Typography.Paragraph>
              </Card>
            </div>

            <div className='space-y-16px'>
              <Card title={t('common.skills.propertiesTitle', { defaultValue: '属性' })}>
                {resolvedSkill.source === 'local' ? (
                  <div className='space-y-12px text-13px'>
                    <div>
                      <div className='text-t-tertiary'>
                        {t('common.skills.propertySource', { defaultValue: '来源' })}
                      </div>
                      <div className='mt-4px text-t-primary'>{resolvedSkill.localSkill.sourceKind}</div>
                    </div>
                    <div>
                      <div className='text-t-tertiary'>
                        {t('common.skills.propertyLocation', { defaultValue: '文件位置' })}
                      </div>
                      <div className='mt-4px text-t-primary break-all'>{resolvedSkill.localSkill.location}</div>
                    </div>
                    <div>
                      <div className='text-t-tertiary'>
                        {t('common.skills.propertyFiles', { defaultValue: '运行时文件' })}
                      </div>
                      <div className='mt-4px text-t-primary'>
                        {resolvedSkill.localSkill.runtimeFiles.join(', ') || '—'}
                      </div>
                    </div>
                    <div>
                      <div className='text-t-tertiary'>
                        {t('common.skills.propertyPlatforms', { defaultValue: '平台' })}
                      </div>
                      <div className='mt-4px text-t-primary'>
                        {resolvedSkill.localSkill.platforms.join(', ') || 'generic'}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className='space-y-12px text-13px'>
                    <div>
                      <div className='text-t-tertiary'>
                        {t('common.skills.propertyScope', { defaultValue: '范围' })}
                      </div>
                      <div className='mt-4px text-t-primary'>{resolvedSkill.orgSkill.scope}</div>
                    </div>
                    <div>
                      <div className='text-t-tertiary'>
                        {t('common.skills.propertyEnabled', { defaultValue: '启用状态' })}
                      </div>
                      <div className='mt-4px text-t-primary'>
                        {resolvedSkill.orgSkill.enabled === 1
                          ? t('common.show', { defaultValue: '显示' })
                          : t('common.hide', { defaultValue: '隐藏' })}
                      </div>
                    </div>
                    <div>
                      <div className='text-t-tertiary'>
                        {t('common.skills.propertyUpdatedAt', { defaultValue: '最近更新' })}
                      </div>
                      <div className='mt-4px text-t-primary'>
                        {new Date(resolvedSkill.orgSkill.updated_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          </div>
        )}
      </Spin>
    </PageContentShell>
  );
};

export default SkillDetailPage;
