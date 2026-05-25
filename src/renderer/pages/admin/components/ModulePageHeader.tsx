/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Space, Typography } from '@arco-design/web-react';

type ModulePageHeaderProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
};

const ModulePageHeader: React.FC<ModulePageHeaderProps> = ({
  title,
  description,
  actions,
}) => {
  return (
    <div className='flex items-center justify-between mb-16px gap-12px flex-wrap'>
      <div>
        <Typography.Title heading={5} className='mt-0 mb-4px'>
          {title}
        </Typography.Title>
        <Typography.Paragraph type='secondary' className='mb-0 text-13px'>
          {description}
        </Typography.Paragraph>
      </div>
      {actions ? <Space>{actions}</Space> : null}
    </div>
  );
};

export default ModulePageHeader;
