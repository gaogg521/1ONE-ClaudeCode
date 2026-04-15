/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** Workspace-relative Gemini CLI log directory (matches main-process GeminiAgent). */
export function geminiSessionLogsDir(workspace: string): string {
  const normalized = workspace.replace(/[/\\]+$/, '');
  const sep = normalized.includes('\\') ? '\\' : '/';
  return `${normalized}${sep}.gemini${sep}logs`;
}

/**
 * Opens `<workspace>/.gemini/logs` in the system file manager (same folder as request + error dumps).
 */
export const GeminiSessionLogsLink: React.FC<{ workspace?: string }> = ({ workspace }) => {
  const { t } = useTranslation();

  const openLogsDir = useCallback(async () => {
    if (!workspace?.trim()) {
      Message.warning(t('conversation.gemini.noWorkspaceForLogs'));
      return;
    }
    const dir = geminiSessionLogsDir(workspace.trim());
    try {
      await ipcBridge.shell.openFolderEnsure.invoke(dir);
    } catch {
      Message.error(t('conversation.gemini.openLogsFailed'));
    }
  }, [t, workspace]);

  if (!workspace?.trim()) {
    return null;
  }

  return (
    <Tooltip content={t('conversation.gemini.viewSessionLogsTooltip')}>
      <Button type='text' size='mini' className='!px-6px text-12px' onClick={() => void openLogsDir()}>
        {t('conversation.gemini.viewSessionLogs')}
      </Button>
    </Tooltip>
  );
};
