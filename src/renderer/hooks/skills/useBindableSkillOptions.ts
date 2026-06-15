/**
 * Skill options for digital-employee binding — same sources as the Skills sidebar page.
 *
 * @license Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import { useEditionFeatures } from '@/renderer/hooks/webui/useEditionFeatures';
import { listSkills } from '@/renderer/utils/enterpriseApi/modules';

export type BindableSkillSource = 'local' | 'org';

export type BindableSkillOption = {
  value: string;
  label: string;
  source: BindableSkillSource;
  description: string;
};

export function encodeLocalSkillId(name: string): string {
  return `local:${name}`;
}

export function encodeOrgSkillId(id: string): string {
  return `org:${id}`;
}

export function resolveBindableSkillLabel(
  skillId: string,
  options: BindableSkillOption[]
): string {
  const normalized = normalizeStoredSkillId(skillId);
  return options.find((item) => item.value === normalized)?.label ?? normalized.replace(/^(local|org):/, '');
}

/** Legacy bindings stored raw org skill UUIDs without a source prefix. */
export function normalizeStoredSkillId(skillId: string): string {
  if (skillId.startsWith('local:') || skillId.startsWith('org:')) {
    return skillId;
  }
  return encodeOrgSkillId(skillId);
}

export function normalizeStoredSkillIds(skillIds: string[]): string[] {
  return skillIds.map(normalizeStoredSkillId);
}

export async function loadBindableSkillOptions(canUseOrgSkills: boolean): Promise<BindableSkillOption[]> {
  const [localResult, orgResult] = await Promise.allSettled([
    ipcBridge.fs.listAvailableSkills.invoke(),
    canUseOrgSkills ? listSkills() : Promise.resolve([]),
  ]);

  const locals = localResult.status === 'fulfilled' ? (localResult.value ?? []) : [];
  const orgs = orgResult.status === 'fulfilled' ? (orgResult.value ?? []) : [];

  const options: BindableSkillOption[] = [
    ...locals.map((skill) => ({
      value: encodeLocalSkillId(skill.name),
      label: skill.name,
      source: 'local' as const,
      description: skill.description,
    })),
    ...orgs.map((skill) => ({
      value: encodeOrgSkillId(skill.id),
      label: skill.name,
      source: 'org' as const,
      description: skill.description ?? '',
    })),
  ];

  return options.toSorted((a, b) => {
    if (a.source !== b.source) {
      return a.source === 'local' ? -1 : 1;
    }
    return a.label.localeCompare(b.label, 'zh-CN');
  });
}

export function useBindableSkillOptions(visible: boolean) {
  const { can } = useEditionFeatures();
  const canUseOrgSkills = can('skills.org');
  const [options, setOptions] = useState<BindableSkillOption[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!visible) {
      return;
    }
    setLoading(true);
    try {
      setOptions(await loadBindableSkillOptions(canUseOrgSkills));
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [canUseOrgSkills, visible]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { options, loading, reload };
}
