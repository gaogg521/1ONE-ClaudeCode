import { ipcBridge } from '@/common';
import { Spin, Result, Button } from '@arco-design/web-react';
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import TeamPage from './TeamPage';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';

const TeamIndex: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { identity, showTeamsFeature } = useEditionFeatures();

  const { data: team, isLoading, error } = useSWR(
    showTeamsFeature && id ? `team/${identity.tenantId}/${id}` : null,
    () => ipcBridge.team.get.invoke({ id: id!, tenantId: identity.tenantId })
  );

  if (isLoading) return (
    <div className='flex items-center justify-center h-full'>
      <Spin loading />
    </div>
  );

  if (!team || error) return (
    <div className='flex items-center justify-center h-full'>
      <Result
        status='404'
        title={t('team.notFound.title', { defaultValue: '团队不存在' })}
        subTitle={t('team.notFound.desc', { defaultValue: '此团队可能已被删除，请返回重新选择。' })}
        extra={<Button type='primary' onClick={() => navigate('/sessions')}>{t('common.back', { defaultValue: '返回' })}</Button>}
      />
    </div>
  );

  return <TeamPage key={team.id} team={team} />;
};

export default TeamIndex;
