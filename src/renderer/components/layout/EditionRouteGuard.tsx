/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { Message } from '@arco-design/web-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';

/** 未加入企业时访问 /team/* 重定向并提示 */
const EditionRouteGuard: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { showTeamsFeature } = useEditionFeatures();
  const warnedRef = useRef(false);

  useEffect(() => {
    if (showTeamsFeature) {
      warnedRef.current = false;
      return;
    }
    if (!location.pathname.startsWith('/team/')) return;
    if (!warnedRef.current) {
      warnedRef.current = true;
      Message.info(
        t('settings.edition.teamsPersonalBlocked', {
          defaultValue: '当前账号尚未加入企业。加入企业后，即可在主工作台直接使用团队协同。',
        })
      );
    }
    void navigate('/guid', { replace: true });
  }, [location.pathname, navigate, showTeamsFeature, t]);

  return null;
};

export default EditionRouteGuard;
