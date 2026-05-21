/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import EnterpriseComingSoon from '@/renderer/pages/enterprise/EnterpriseComingSoon';

const EnterpriseUsagePage: React.FC = () => (
  <EnterpriseComingSoon
    titleKey='settings.enterpriseConsole.navUsage'
    titleDefault='使用统计'
    descKey='settings.enterpriseConsole.usageComingSoonDesc'
    descDefault='成员会话用量、配额与报表将在此提供，敬请期待。'
  />
);

export default EnterpriseUsagePage;
