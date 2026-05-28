/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import GeminiModalContent from '@/renderer/components/settings/SettingsModal/contents/GeminiModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { Button } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type SystemSection = 'system' | 'gemini' | 'about';

function normalizeSection(input: string | null): SystemSection {
  if (input === 'gemini' || input === 'about' || input === 'system') {
    return input;
  }
  return 'system';
}

const SystemSettings: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = normalizeSection(searchParams.get('section'));

  const changeSection = (next: SystemSection) => {
    if (next === section) return;
    const params = new URLSearchParams(searchParams);
    params.set('section', next);
    setSearchParams(params, { replace: true });
  };

  return (
    <SettingsPageWrapper>
      <div className='flex items-center gap-8px pb-12px'>
        <Button
          type={section === 'system' ? 'primary' : 'outline'}
          className='settings-pill-button'
          onClick={() => changeSection('system')}
        >
          {t('settings.system')}
        </Button>
        <Button
          type={section === 'gemini' ? 'primary' : 'outline'}
          className='settings-pill-button'
          onClick={() => changeSection('gemini')}
        >
          {t('settings.gemini')}
        </Button>
        <Button
          type={section === 'about' ? 'primary' : 'outline'}
          className='settings-pill-button'
          onClick={() => changeSection('about')}
        >
          {t('settings.about')}
        </Button>
      </div>
      {section === 'system' ? <SystemModalContent /> : null}
      {section === 'gemini' ? <GeminiModalContent /> : null}
      {section === 'about' ? <AboutModalContent /> : null}
    </SettingsPageWrapper>
  );
};

export default SystemSettings;
