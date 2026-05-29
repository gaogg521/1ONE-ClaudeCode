/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import styles from '@/renderer/components/layout/EnterpriseEditionBadge.module.css';

type EnterpriseEditionBadgeProps = {
  size?: 'small' | 'default';
};

const EnterpriseEditionBadge: React.FC<EnterpriseEditionBadgeProps> = ({ size = 'default' }) => {
  const { t } = useTranslation();
  const { isEnterpriseEdition, isPersonalEdition, tenantLabel } = useEditionFeatures();

  if (isPersonalEdition) {
    return (
      <Tag size={size === 'small' ? 'small' : 'default'} className={styles.personalTag}>
        {t('settings.edition.badgePersonal', { defaultValue: '个人版' })}
      </Tag>
    );
  }

  if (!isEnterpriseEdition) {
    return null;
  }

  return (
    <span className={styles.wrap}>
      <Tag size={size === 'small' ? 'small' : 'default'} color='arcoblue' className={styles.editionTag}>
        {t('settings.edition.badgeEnterprise', { defaultValue: '企业团队版' })}
      </Tag>
      {tenantLabel ? (
        <span className={size === 'small' ? styles.tenantSmall : styles.tenant} title={tenantLabel}>
          {tenantLabel}
        </span>
      ) : null}
    </span>
  );
};

export default EnterpriseEditionBadge;
