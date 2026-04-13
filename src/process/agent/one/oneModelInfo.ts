/**
 * Model list + compound IDs for the built-in One agent (OpenAI-compatible /chat/completions only).
 */

import { AuthType } from '@office-ai/aioncli-core';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { ConfigStorage } from '@/common/config/storage';
import { getProviderAuthType } from '@/common/utils/platformAuthType';
import { mainLog, mainWarn } from '@process/utils/mainLogger';

const COMPOUND_SEP = '::one::';

export function buildOneCompoundModelId(providerId: string, modelName: string): string {
  return `${providerId}${COMPOUND_SEP}${modelName}`;
}

export function parseOneCompoundModelId(id: string): { providerId: string; modelName: string } | null {
  const idx = id.indexOf(COMPOUND_SEP);
  if (idx < 0) return null;
  return { providerId: id.slice(0, idx), modelName: id.slice(idx + COMPOUND_SEP.length) };
}

function isOpenAiCompatibleForOne(pwm: TProviderWithModel): boolean {
  // Model list should not depend on whether the user has already filled API Key.
  // Lack of key should surface at request time (clear error), not hide models.
  return getProviderAuthType(pwm) === AuthType.USE_OPENAI;
}

export async function listOneAgentSelectableModels(): Promise<Array<{ id: string; label: string }>> {
  // Prefer ConfigStorage (intercepted) so updates are reflected immediately.
  const providers = (await ConfigStorage.get('model.config').catch((): undefined => undefined)) as IProvider[] | undefined;
  if (!Array.isArray(providers)) return [];
  const out: Array<{ id: string; label: string }> = [];
  for (const p of providers) {
    if (p.enabled === false) continue;
    for (const m of p.model || []) {
      if (p.modelEnabled?.[m] === false) continue;
      const pwm: TProviderWithModel = { ...p, useModel: m };
      if (!isOpenAiCompatibleForOne(pwm)) continue;
      out.push({
        id: buildOneCompoundModelId(p.id, m),
        label: `${p.name} · ${m}`,
      });
    }
  }
  mainLog('[oneModelInfo]', 'list selectable models', {
    providers: providers.length,
    selectableModels: out.length,
    providerIds: providers.map((p) => p.id).slice(0, 10),
  });
  return out;
}

export async function resolveTProviderFromOneCompoundId(modelId: string): Promise<TProviderWithModel | null> {
  const parsed = parseOneCompoundModelId(modelId);
  if (!parsed) return null;
  const providers = (await ConfigStorage.get('model.config').catch((): undefined => undefined)) as IProvider[] | undefined;
  const p = providers?.find((x) => x.id === parsed.providerId);
  if (!p || p.enabled === false) return null;
  if (!p.model?.includes(parsed.modelName)) return null;
  if (p.modelEnabled?.[parsed.modelName] === false) return null;
  const pwm: TProviderWithModel = { ...p, useModel: parsed.modelName };
  if (!isOpenAiCompatibleForOne(pwm)) return null;
  return pwm;
}

export async function buildOneAcpModelInfo(current: TProviderWithModel | undefined | null): Promise<AcpModelInfo> {
  const availableModels = await listOneAgentSelectableModels();
  let currentModelId: string | null = null;
  let currentModelLabel: string | null = null;
  if (current?.id && current.useModel) {
    currentModelId = buildOneCompoundModelId(current.id, current.useModel);
    const match = availableModels.find((m) => m.id === currentModelId);
    currentModelLabel = match?.label ?? `${current.name} · ${current.useModel}`;
  }
  if (availableModels.length === 0) {
    mainWarn('[oneModelInfo]', 'no availableModels for 1ONE CODE', {
      currentProviderId: current?.id ?? null,
      currentUseModel: current?.useModel ?? null,
      currentPlatform: current?.platform ?? null,
    });
  }
  return {
    currentModelId,
    currentModelLabel,
    availableModels,
    canSwitch: availableModels.length > 0,
    source: 'models',
  };
}
