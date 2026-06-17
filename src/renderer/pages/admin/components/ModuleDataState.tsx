/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Empty, Spin } from '@arco-design/web-react';

type ModuleDataStateProps = {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyDescription: string;
  children: React.ReactNode;
};

const ModuleDataState: React.FC<ModuleDataStateProps> = ({ loading, error, empty, emptyDescription, children }) => {
  if (loading) {
    return (
      <div className='flex justify-center py-40px'>
        <Spin />
      </div>
    );
  }

  if (error) {
    return <Alert type='error' content={error} />;
  }

  if (empty) {
    return <Empty description={emptyDescription} />;
  }

  return <>{children}</>;
};

export default ModuleDataState;
