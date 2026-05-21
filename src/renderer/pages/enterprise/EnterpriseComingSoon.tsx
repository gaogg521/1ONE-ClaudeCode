/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type EnterpriseComingSoonProps = {
  titleKey: string;
  titleDefault: string;
  descKey: string;
  descDefault: string;
};

const EnterpriseComingSoon: React.FC<EnterpriseComingSoonProps> = ({
  titleKey,
  titleDefault,
  descKey,
  descDefault,
}) => {
  const { t } = useTranslation();

  return (
    <div className='max-w-720px py-24px'>
      <Typography.Title heading={5} className='mb-8px'>
        {t(titleKey, { defaultValue: titleDefault })}
      </Typography.Title>
      <Typography.Paragraph type='secondary' className='mb-0'>
        {t(descKey, { defaultValue: descDefault })}
      </Typography.Paragraph>
    </div>
  );
};

export default EnterpriseComingSoon;
