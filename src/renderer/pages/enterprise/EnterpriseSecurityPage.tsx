/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import EnterpriseComingSoon from '@/renderer/pages/enterprise/EnterpriseComingSoon';

const EnterpriseSecurityPage: React.FC = () => (
  <EnterpriseComingSoon
    titleKey='settings.enterpriseConsole.navSecurity'
    titleDefault='安全与审计'
    descKey='settings.enterpriseConsole.securityComingSoonDesc'
    descDefault='工作安全策略、审计日志与合规配置将在此提供，敬请期待。'
  />
);

export default EnterpriseSecurityPage;
