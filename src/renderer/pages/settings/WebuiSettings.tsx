/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import WebuiStandaloneBanner from '@/renderer/pages/settings/WebuiSettings/WebuiStandaloneBanner';

const WebuiSettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <WebuiStandaloneBanner />
      <WebuiModalContent />
    </SettingsPageWrapper>
  );
};

export default WebuiSettings;
