/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Tabs } from '@arco-design/web-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import AdminPageWrapper from './components/AdminPageWrapper';

const AdminShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const active = useMemo(() => {
    if (location.pathname.startsWith('/admin/auth')) return 'auth';
    if (location.pathname.startsWith('/admin/teams')) return 'teams';
    return 'users';
  }, [location.pathname]);

  return (
    <AdminPageWrapper>
      <div className='flex items-center justify-between mb-16px'>
        <div className='text-18px font-700 text-t-primary'>企业管理员后台</div>
      </div>
      <Tabs
        activeTab={active}
        onChange={(key) => {
          if (key === 'auth') navigate('/admin/auth');
          else if (key === 'teams') navigate('/admin/teams');
          else navigate('/admin/users');
        }}
      >
        <Tabs.TabPane key='users' title='用户与绑定' />
        <Tabs.TabPane key='teams' title='团队与权限' />
        <Tabs.TabPane key='auth' title='登录与认证' />
      </Tabs>
      <div className='mt-16px'>
        <Outlet />
      </div>
    </AdminPageWrapper>
  );
};

export default AdminShell;

