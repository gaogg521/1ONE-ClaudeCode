import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Input, Message, Modal, Spin, Tag, Typography } from '@arco-design/web-react';
import { Link, Search } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { IUrlSkillPreview } from '@/common/adapter/ipcBridge';
import PageContentShell from '@/renderer/components/layout/PageContentShell';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import type { SkillMetadata } from '@/common/types/skillMetadata';
import { listSkills, type SkillRecord } from '@/renderer/utils/enterpriseApi/modules';

type SkillListItem =
  | { key: string; source: 'local'; title: string; subtitle: string; localSkill: SkillMetadata }
  | { key: string; source: 'org'; title: string; subtitle: string; orgSkill: SkillRecord };

const SkillsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { can } = useEditionFeatures();
  const canUseOrgSkills = can('skills.org');
  const [loading, setLoading] = useState(true);
  const [localSkills, setLocalSkills] = useState<SkillMetadata[]>([]);
  const [orgSkills, setOrgSkills] = useState<SkillRecord[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'local' | 'org'>('all');
  const [githubImportModalVisible, setGithubImportModalVisible] = useState(false);
  const [githubUrlInput, setGithubUrlInput] = useState('');
  const [githubPreview, setGithubPreview] = useState<IUrlSkillPreview | null>(null);
  const [githubPreviewLoading, setGithubPreviewLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [localResult, orgResult] = await Promise.allSettled([
      ipcBridge.fs.listAvailableSkills.invoke(),
      canUseOrgSkills ? listSkills() : Promise.resolve([]),
    ]);
    setLocalSkills(localResult.status === 'fulfilled' ? localResult.value ?? [] : []);
    setOrgSkills(orgResult.status === 'fulfilled' ? orgResult.value ?? [] : []);
    setLoading(false);
  }, [canUseOrgSkills]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handlePreviewSkillsFromUrl = useCallback(async () => {
    setGithubPreviewLoading(true);
    try {
      const result = await ipcBridge.fs.previewSkillsFromUrl.invoke({ url: githubUrlInput.trim() });
      if (!result.success || !result.data) {
        Message.error(result.msg || t('common.skills.previewFailed', { defaultValue: '预览失败' }));
        return;
      }
      setGithubPreview(result.data);
    } catch {
      Message.error(t('common.skills.previewFailed', { defaultValue: '预览失败' }));
    } finally {
      setGithubPreviewLoading(false);
    }
  }, [githubUrlInput, t]);

  const handleImportSkillFromUrl = useCallback(
    async (skill: SkillMetadata) => {
      if (!githubPreview) {
        return;
      }
      try {
        const result = await ipcBridge.fs.importSkillFromUrl.invoke({
          skillPath: skill.directory || githubPreview.cacheDir,
        });
        if (!result.success) {
          Message.error(result.msg || t('common.skills.importFailed', { defaultValue: '导入失败' }));
          return;
        }
        Message.success(
          t('common.skills.importSuccess', {
            defaultValue: '已导入技能「{{name}}」',
            name: skill.name,
          })
        );
        setGithubImportModalVisible(false);
        setGithubUrlInput('');
        setGithubPreview(null);
        await reload();
      } catch {
        Message.error(t('common.skills.importFailed', { defaultValue: '导入失败' }));
      }
    },
    [githubPreview, reload, t]
  );

  const items = useMemo<SkillListItem[]>(() => {
    const locals = localSkills.map((skill) => ({
      key: skill.name,
      source: 'local' as const,
      title: skill.name,
      subtitle: skill.description || t('common.skills.localSkill', { defaultValue: '本地技能' }),
      localSkill: skill,
    }));
    const teams = orgSkills.map((skill) => ({
      key: `org__${skill.id}`,
      source: 'org' as const,
      title: skill.name,
      subtitle: skill.description || t('common.skills.orgSkill', { defaultValue: '团队技能' }),
      orgSkill: skill,
    }));
    return [...locals, ...teams];
  }, [localSkills, orgSkills, t]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== 'all' && item.source !== filter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        item.title.toLowerCase().includes(query) ||
        item.subtitle.toLowerCase().includes(query)
      );
    });
  }, [filter, items, search]);

  return (
    <PageContentShell className='skills-page-shell' contentClassName='max-w-1400px pb-40px'>
      <div className='flex items-start justify-between gap-16px flex-wrap'>
        <div className='min-w-0'>
          <div className='text-20px font-700 text-t-primary'>
            {t('common.skills.title', { defaultValue: 'Skills' })}
          </div>
          <div className='mt-4px text-13px text-t-tertiary'>
            {t('common.skills.subtitle', {
              defaultValue:
                '浏览、导入和复用你的能力包。把能稳定复用的流程沉淀成 Skill，再分发给助手或团队。',
            })}
          </div>
        </div>
        <div className='flex items-center gap-8px flex-wrap'>
          <Button size='small' type='outline' onClick={() => navigate('/settings/skills-hub')}>
            {t('common.skills.openHub', { defaultValue: '打开 Skills Hub' })}
          </Button>
          <Button size='small' onClick={() => setGithubImportModalVisible(true)}>
            {t('common.skills.importFromUrl', { defaultValue: '从 URL 导入' })}
          </Button>
          {canUseOrgSkills ? (
            <Button size='small' type='primary' onClick={() => navigate('/enterprise/skills')}>
              {t('common.skills.openAdmin', { defaultValue: '打开团队技能后台' })}
            </Button>
          ) : null}
        </div>
      </div>

      <Card className='mt-16px'>
        <div className='flex items-center justify-between gap-12px flex-wrap'>
          <Input
            allowClear
            prefix={<Search theme='outline' size='16' />}
            placeholder={t('common.skills.searchPlaceholder', { defaultValue: '搜索技能名称或描述' })}
            value={search}
            onChange={setSearch}
            style={{ width: 320 }}
          />
          <div className='flex items-center gap-8px flex-wrap'>
            {([
              ['all', t('common.skills.filterAll', { defaultValue: '全部' })],
              ['local', t('common.skills.filterLocal', { defaultValue: '本地技能' })],
              ...(canUseOrgSkills
                ? ([['org', t('common.skills.filterOrg', { defaultValue: '团队技能' })]] as const)
                : []),
            ] as const).map(([key, label]) => (
              <Button
                key={key}
                size='small'
                type={filter === key ? 'primary' : 'outline'}
                onClick={() => setFilter(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Spin className='w-full mt-16px' loading={loading}>
        {filteredItems.length === 0 ? (
          <Card className='mt-16px'>
            <Empty
              description={t('common.skills.empty', {
                defaultValue: '当前没有可展示的技能。可以从 URL 导入，或到 Skills Hub 继续管理。',
              })}
            />
          </Card>
        ) : (
          <div className='mt-16px grid gap-12px md:grid-cols-2 xl:grid-cols-3'>
            {filteredItems.map((item) => (
              <Card
                key={item.key}
                className='cursor-pointer border border-solid border-[var(--color-border-2)] rd-12px'
                hoverable
                bodyStyle={{ padding: 16 }}
                onClick={() => navigate(`/skills/${encodeURIComponent(item.key)}`)}
              >
                <div className='flex h-full flex-col gap-10px'>
                  <div className='flex items-center gap-8px flex-wrap'>
                    <div className='text-14px font-semibold text-t-primary'>{item.title}</div>
                    <Tag size='small' color={item.source === 'local' ? 'arcoblue' : 'purple'}>
                      {item.source === 'local'
                        ? t('common.skills.localSkill', { defaultValue: '本地技能' })
                        : t('common.skills.orgSkill', { defaultValue: '团队技能' })}
                    </Tag>
                  </div>
                  <Typography.Paragraph className='mb-0 text-12px text-t-tertiary line-clamp-3'>
                    {item.subtitle}
                  </Typography.Paragraph>
                  <div className='mt-auto flex items-center justify-between gap-8px text-11px text-t-tertiary'>
                    {item.source === 'local' ? (
                      <span>
                        {t('common.skills.localFiles', {
                          defaultValue: '{{count}} 个运行时文件',
                          count: item.localSkill.runtimeFiles.length,
                        })}
                      </span>
                    ) : (
                      <span>
                        {t('common.skills.orgScope', {
                          defaultValue: '范围：{{scope}}',
                          scope: item.orgSkill.scope,
                        })}
                      </span>
                    )}
                    <Link theme='outline' size='12' />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Spin>

      <Modal
        title={t('common.skills.importFromUrl', { defaultValue: '从 URL 导入' })}
        visible={githubImportModalVisible}
        onCancel={() => {
          setGithubImportModalVisible(false);
          setGithubPreview(null);
          setGithubUrlInput('');
        }}
        footer={null}
      >
        <div className='space-y-12px'>
          <Typography.Paragraph className='mb-0 text-12px text-t-tertiary'>
            {t('common.skills.importHint', {
              defaultValue: '支持 GitHub 仓库、目录链接或直接指向 SKILL.md 的链接。先预览，再选择导入。',
            })}
          </Typography.Paragraph>
          <Input
            value={githubUrlInput}
            onChange={setGithubUrlInput}
            placeholder='https://github.com/...'
          />
          <Button
            type='primary'
            loading={githubPreviewLoading}
            disabled={!githubUrlInput.trim()}
            onClick={() => void handlePreviewSkillsFromUrl()}
          >
            {t('common.skills.previewAction', { defaultValue: '预览' })}
          </Button>
          {githubPreview ? (
            <div className='space-y-10px'>
              <div className='text-12px text-t-tertiary'>{githubPreview.resolvedUrl}</div>
              {githubPreview.skills.map((skill: SkillMetadata) => (
                <div key={skill.name} className='rd-10px border border-solid border-[var(--color-border-2)] p-12px'>
                  <div className='text-13px font-600 text-t-primary'>{skill.name}</div>
                  <div className='mt-6px text-12px text-t-tertiary'>{skill.description}</div>
                  <Button className='mt-10px' size='small' type='primary' onClick={() => void handleImportSkillFromUrl(skill)}>
                    {t('common.import', { defaultValue: '导入' })}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>
    </PageContentShell>
  );
};

export default SkillsPage;
