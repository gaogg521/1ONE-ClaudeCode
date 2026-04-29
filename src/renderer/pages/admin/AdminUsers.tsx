/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Spin } from '@arco-design/web-react';
import UsersPage from '@/renderer/pages/users';
import { useEnterpriseGate } from '@/renderer/pages/settings/enterpriseGateContext';

const AdminUsers: React.FC = () => {
  const gate = useEnterpriseGate();
  if (gate.status === 'loading') {
    return (
      <div className='flex justify-center py-40px'>
        <Spin />
      </div>
    );
  }
  const enterpriseAccess = gate.eligible && gate.elevated ? 'full' : 'profile';
  return <UsersPage enterpriseAccess={enterpriseAccess} />;
};

export default AdminUsers;

