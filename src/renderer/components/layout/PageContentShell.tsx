/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { type CSSProperties } from 'react';

import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';

type PageContentShellProps = {
  children: React.ReactNode;
  header?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  disableOverflow?: boolean;
  style?: CSSProperties;
};

const PageContentShell: React.FC<PageContentShellProps> = ({
  children,
  header,
  className,
  contentClassName,
  disableOverflow = false,
  style,
}) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  const shellClassName = classNames(
    'w-full min-h-full box-border',
    disableOverflow ? 'overflow-visible' : 'overflow-y-auto',
    isMobile ? 'px-16px py-14px' : 'px-16px md:px-40px py-24px md:py-32px',
    className
  );

  const contentClass = classNames('mx-auto w-full md:max-w-1200px', contentClassName);

  return (
    <div data-testid='page-content-shell' className={shellClassName} style={style}>
      {header}
      <div data-testid='page-content-shell-content' className={contentClass}>
        {children}
      </div>
    </div>
  );
};

export default PageContentShell;
