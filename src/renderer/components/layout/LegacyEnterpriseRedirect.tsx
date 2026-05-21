/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LEGACY_ENTERPRISE_PREFIX } from '@/renderer/pages/enterprise/paths';

const LegacyEnterpriseRedirect: React.FC = () => {
  const location = useLocation();
  const suffix = location.pathname.slice(LEGACY_ENTERPRISE_PREFIX.length);
  return <Navigate to={`/enterprise${suffix}${location.search}`} replace />;
};

export default LegacyEnterpriseRedirect;
