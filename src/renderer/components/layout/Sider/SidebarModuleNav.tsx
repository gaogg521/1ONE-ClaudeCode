/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { cleanupSiderTooltips, type SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { getSidebarNavItems, isNavItemActive } from '@/renderer/components/layout/sidebarNav';
import { appNavigate } from '@/renderer/utils/appNavigate';
import styles from './Sider.module.css';

type SidebarModuleNavProps = {
  collapsed: boolean;
  isMobile: boolean;
  siderTooltipProps: SiderTooltipProps;
  onNavigate?: () => void;
};

const SidebarModuleNav: React.FC<SidebarModuleNavProps> = ({ collapsed, isMobile, siderTooltipProps, onNavigate }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { gate } = useEditionFeatures();
  const items = getSidebarNavItems(gate);
  const iconOnly = collapsed && !isMobile;
  const tooltipEnabled = iconOnly;

  const handleNavigate = useCallback(
    (path: string) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[nav] sidebar click', { from: location.pathname, to: path });
      }
      cleanupSiderTooltips();
      appNavigate(navigate, path);
      onNavigate?.();
    },
    [location.pathname, navigate, onNavigate]
  );

  return (
    <nav
      className={classNames(styles.moduleNav, iconOnly && styles.moduleNavIconOnly)}
      aria-label={t('nav.moduleNav', { defaultValue: 'Module navigation' })}
    >
      {items.map((item) => {
        const active = isNavItemActive(location.pathname, item);
        const label = t(item.labelKey, { defaultValue: item.labelDefault });
        const row = (
          <button
            type='button'
            className={classNames(styles.moduleNavItem, active && styles.moduleNavItemActive)}
            onClick={() => handleNavigate(item.path)}
          >
            <span className={styles.moduleNavIcon}>{item.icon}</span>
            {!iconOnly ? <span className={classNames('collapsed-hidden', styles.moduleNavLabel)}>{label}</span> : null}
          </button>
        );

        if (!tooltipEnabled) {
          return <React.Fragment key={item.path}>{row}</React.Fragment>;
        }

        return (
          <Tooltip key={item.path} {...siderTooltipProps} content={label} position='right'>
            {row}
          </Tooltip>
        );
      })}
    </nav>
  );
};

export default SidebarModuleNav;
