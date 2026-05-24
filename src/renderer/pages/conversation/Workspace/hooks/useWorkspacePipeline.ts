/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { fetchWebuiApiJson } from '@/renderer/utils/webuiApiBase';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';
import { ipcBridge } from '@/common';

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  return fetchWebuiApiJson<T>(path, opts);
}
async function apiMutate<T>(path: string, method: string, payload: Record<string, unknown>): Promise<T> {
  return api<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(withCsrfToken(payload)),
  });
}

export interface IPipeline {
  id: string;
  name: string;
}
export interface IPipelineRun {
  id: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  log_content: string | null;
  stages_status_json: string | null;
}

interface UseWorkspacePipelineResult {
  pipelines: IPipeline[];
  selectedPipelineId: string;
  activeRun: IPipelineRun | null;
  triggering: boolean;
  loadPipelines: () => Promise<void>;
  triggerRun: () => Promise<void>;
  selectPipeline: (id: string) => void;
}

export function useWorkspacePipeline(workspace: string): UseWorkspacePipelineResult {
  const { t } = useTranslation();
  const [pipelines, setPipelines] = useState<IPipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [activeRun, setActiveRun] = useState<IPipelineRun | null>(null);
  const [triggering, setTriggering] = useState(false);
  const autoTriggeredRef = useRef(false);

  const loadPipelines = useCallback(async () => {
    try {
      const res = await api<{ success: boolean; data: IPipeline[] }>('/api/admin/pipelines');
      if (res?.success && res.data?.length > 0) {
        setPipelines(res.data);
        if (!selectedPipelineId) setSelectedPipelineId(res.data[0].id);
      }
    } catch { /* ignore */ }
  }, [selectedPipelineId]);

  const triggerRun = useCallback(async () => {
    if (!selectedPipelineId) return;
    setTriggering(true);
    try {
      const res = await apiMutate<{ success: boolean; data: { runId: string } }>(`/api/admin/pipelines/run/${selectedPipelineId}`, 'POST', {});
      if (res?.success) {
        setActiveRun({
          id: res.data.runId,
          status: 'pending',
          log_content: t('admin.pipeline.message.starting', { defaultValue: '正在初始化流水线环境...\n' }),
          stages_status_json: null,
        });
      }
    } catch { /* ignore */ } finally { setTriggering(false); }
  }, [selectedPipelineId, t]);

  // Poll active run every 1.5s
  useEffect(() => {
    if (!activeRun || ['success', 'failed', 'cancelled'].includes(activeRun.status)) return;
    const timer = setInterval(async () => {
      try {
        const res = await api<{ success: boolean; data: IPipelineRun }>(`/api/admin/pipelines/runs/${activeRun.id}`);
        if (res?.success) setActiveRun(res.data);
      } catch { /* ignore */ }
    }, 1500);
    return () => clearInterval(timer);
  }, [activeRun]);

  // Auto-trigger on file changes
  useEffect(() => {
    const unsub = ipcBridge.fileStream.contentUpdate.on(({ filePath, operation }) => {
      if (autoTriggeredRef.current) return; // Only trigger once per session
      if (operation !== 'write') return;
      // Only trigger on .ts/.tsx/.js files
      if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return;
      autoTriggeredRef.current = true;
      void loadPipelines().then(() => {
        if (selectedPipelineId) void triggerRun();
      });
    });
    return () => unsub();
  }, [loadPipelines, selectedPipelineId, triggerRun]);

  return { pipelines, selectedPipelineId, activeRun, triggering, loadPipelines, triggerRun, selectPipeline: setSelectedPipelineId };
}