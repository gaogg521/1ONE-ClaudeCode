/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ConversationHistoryProvider } from '@/renderer/hooks/context/ConversationHistoryContext';
import Layout from '@/renderer/components/layout/Layout';
import Sider from '@/renderer/components/layout/Sider';

/** Personal workspace shell: sessions sider + main content (not enterprise console). */
const PersonalShell: React.FC = () => (
  <ConversationHistoryProvider>
    <Layout sider={<Sider />} />
  </ConversationHistoryProvider>
);

export default PersonalShell;
