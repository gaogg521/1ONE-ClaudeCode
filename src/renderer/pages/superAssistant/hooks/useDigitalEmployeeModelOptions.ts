/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import { useModelProviderList } from '@/renderer/hooks/agent/useModelProviderList';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import { agentKey } from '@/renderer/pages/team/components/agentSelectUtils';
import { getConversationTypeForBackend } from '@/common/utils/buildAgentConversationParams';

export type DigitalEmployeeModelOption = {
  value: string;
  label: string;
};

type UseDigitalEmployeeModelOptionsResult = {
  options: DigitalEmployeeModelOption[];
  loading: boolean;
  selectedModelId: string | undefined;
  setSelectedModelId: (value: string | undefined) => void;
  supportsModelPick: boolean;
};

export function useDigitalEmployeeModelOptions(
  visible: boolean,
  agents: AvailableAgent[],
  selectedAgentKey: string | undefined
): UseDigitalEmployeeModelOptionsResult {
  const [acpCachedModels, setAcpCachedModels] = useState<Record<string, AcpModelInfo>>({});
  const [loading, setLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>();
  const probedRef = useRef(new Set<string>());

  const selectedAgent = useMemo(
    () => agents.find((agent) => agentKey(agent) === selectedAgentKey),
    [agents, selectedAgentKey]
  );
  const backend = selectedAgent?.backend;
  const conversationType = backend ? getConversationTypeForBackend(backend) : undefined;
  const { providers, getAvailableModels, formatModelLabel } = useModelProviderList();

  useEffect(() => {
    if (!visible) {
      return;
    }
    let active = true;
    void ConfigStorage.get('acp.cachedModels')
      .then((cached) => {
        if (active) {
          setAcpCachedModels(cached || {});
        }
      })
      .catch(() => {
        if (active) {
          setAcpCachedModels({});
        }
      });
    return () => {
      active = false;
    };
  }, [visible]);

  useEffect(() => {
    setSelectedModelId(undefined);
    probedRef.current.clear();
  }, [selectedAgentKey]);

  useEffect(() => {
    if (!visible || !backend || conversationType !== 'acp') {
      return;
    }
    if (probedRef.current.has(backend)) {
      return;
    }
    probedRef.current.add(backend);
    let cancelled = false;
    setLoading(true);
    void ipcBridge.acpConversation.probeModelInfo
      .invoke({ backend })
      .then(async (result) => {
        if (cancelled) {
          return;
        }
        const modelInfo = result.success ? result.data?.modelInfo : null;
        if (!modelInfo?.availableModels?.length) {
          probedRef.current.delete(backend);
          return;
        }
        const cached =
          (await ConfigStorage.get('acp.cachedModels').catch((): Record<string, AcpModelInfo> => ({}))) || {};
        const nextCached = { ...cached, [backend]: modelInfo };
        setAcpCachedModels(nextCached);
        await ConfigStorage.set('acp.cachedModels', nextCached).catch((): undefined => undefined);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [backend, conversationType, visible]);

  const options = useMemo<DigitalEmployeeModelOption[]>(() => {
    if (!backend) {
      return [];
    }
    if (conversationType === 'acp') {
      const models = acpCachedModels[backend]?.availableModels ?? [];
      return models.map((model) => ({
        value: model.id,
        label: model.label || model.id,
      }));
    }
    if (conversationType === 'gemini' || conversationType === 'aionrs') {
      const collected: DigitalEmployeeModelOption[] = [];
      for (const provider of providers) {
        if (provider.enabled === false) {
          continue;
        }
        for (const modelName of getAvailableModels(provider)) {
          collected.push({
            value: `${provider.id}::${modelName}`,
            label: formatModelLabel(provider, modelName),
          });
        }
      }
      return collected;
    }
    return [];
  }, [acpCachedModels, backend, conversationType, formatModelLabel, getAvailableModels, providers]);

  const supportsModelPick = options.length > 0;

  return {
    options,
    loading,
    selectedModelId,
    setSelectedModelId,
    supportsModelPick,
  };
}
