/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import classNames from 'classnames';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';

const AdminPageWrapper: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  const containerClass = classNames(
    'w-full min-h-full box-border overflow-y-auto',
    isMobile ? 'px-16px py-14px' : 'px-12px md:px-40px py-32px',
    className
  );

  return <div className={containerClass}>{children}</div>;
};

export default AdminPageWrapper;

