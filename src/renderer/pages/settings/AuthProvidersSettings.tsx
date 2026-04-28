/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import AuthProvidersModalContent from '@/renderer/components/settings/SettingsModal/contents/AuthProvidersModalContent';

const AuthProvidersSettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <AuthProvidersModalContent />
    </SettingsPageWrapper>
  );
};

export default AuthProvidersSettings;

