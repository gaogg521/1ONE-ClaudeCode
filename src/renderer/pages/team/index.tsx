import { ipcBridge } from '@/common';
import { Spin, Result, Button } from '@arco-design/web-react';
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import TeamPage from './TeamPage';

const TeamIndex: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: team, isLoading, error } = useSWR(
    id ? `team/${id}` : null,
    () => ipcBridge.team.get.invoke({ id: id! })
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
        title='团队不存在'
        subTitle='此团队可能已被删除，请返回重新选择。'
        extra={<Button type='primary' onClick={() => navigate('/sessions')}>返回</Button>}
      />
    </div>
  );

  return <TeamPage key={team.id} team={team} />;
};

export default TeamIndex;
