/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import PageContentShell from '@/renderer/components/layout/PageContentShell';

const AdminPageWrapper: React.FC<{
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}> = ({ children, className, contentClassName }) => {
  return (
    <PageContentShell
      className={className}
      contentClassName={contentClassName}
      disableOverflow
    >
      {children}
    </PageContentShell>
  );
};

export default AdminPageWrapper;

