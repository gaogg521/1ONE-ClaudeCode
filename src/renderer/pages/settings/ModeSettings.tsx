/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import AppLoader from '@renderer/components/layout/AppLoader';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const ModelModalContent = React.lazy(() => import('@/renderer/components/settings/SettingsModal/contents/ModelModalContent'));

const ModeSettings: React.FC = () => {
  return (
    <SettingsPageWrapper contentClassName='max-w-1100px'>
      <Suspense fallback={<AppLoader />}>
        <ModelModalContent />
      </Suspense>
    </SettingsPageWrapper>
  );
};

export default ModeSettings;
