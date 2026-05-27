import { useCallback, useEffect, useMemo, useState } from 'react';
import type { McpRegistryRecord, RagDocumentRecord, SkillRecord } from '@/renderer/utils/enterpriseApi/modules';
import { listMcpRegistry, listRagDocuments, listSkills } from '@/renderer/utils/enterpriseApi/modules';

export type EnterpriseCollaborationContext = {
  loading: boolean;
  ragDocumentCount: number;
  ragReady: boolean;
  skillCount: number;
  skillNames: string[];
  enabledMcpCount: number;
  mcpNames: string[];
};

const EMPTY_CONTEXT: EnterpriseCollaborationContext = {
  loading: false,
  ragDocumentCount: 0,
  ragReady: false,
  skillCount: 0,
  skillNames: [],
  enabledMcpCount: 0,
  mcpNames: [],
};

function buildContext(
  skills: SkillRecord[],
  mcpRegistry: McpRegistryRecord[],
  ragDocuments: RagDocumentRecord[]
): EnterpriseCollaborationContext {
  const ragDocumentCount = ragDocuments.length;
  const enabledMcp = mcpRegistry.filter((item) => item.enabled);
  return {
    loading: false,
    ragDocumentCount,
    ragReady: ragDocumentCount > 0,
    skillCount: skills.length,
    skillNames: skills.slice(0, 3).map((skill) => skill.name),
    enabledMcpCount: enabledMcp.length,
    mcpNames: enabledMcp.slice(0, 3).map((item) => item.name),
  };
}

export function useEnterpriseCollaborationContext(enabled: boolean): EnterpriseCollaborationContext {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [mcpRegistry, setMcpRegistry] = useState<McpRegistryRecord[]>([]);
  const [ragDocuments, setRagDocuments] = useState<RagDocumentRecord[]>([]);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSkills([]);
      setMcpRegistry([]);
      setRagDocuments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [skillsResult, mcpResult, ragResult] = await Promise.allSettled([
      listSkills(),
      listMcpRegistry(),
      listRagDocuments(),
    ]);
    setSkills(skillsResult.status === 'fulfilled' ? (skillsResult.value ?? []) : []);
    setMcpRegistry(mcpResult.status === 'fulfilled' ? (mcpResult.value ?? []) : []);
    setRagDocuments(ragResult.status === 'fulfilled' ? (ragResult.value ?? []) : []);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    let disposed = false;
    void refresh().catch(() => {
      if (!disposed) {
        setLoading(false);
      }
    });

    return () => {
      disposed = true;
    };
  }, [refresh]);

  return useMemo(() => {
    if (!enabled) {
      return EMPTY_CONTEXT;
    }
    return {
      ...buildContext(skills, mcpRegistry, ragDocuments),
      loading,
    };
  }, [enabled, loading, mcpRegistry, ragDocuments, skills]);
}

export function pickEnterpriseCollaborationContext(
  data: Pick<
    EnterpriseCollaborationContext,
    'ragDocumentCount' | 'skillCount' | 'skillNames' | 'enabledMcpCount' | 'mcpNames'
  >
): Omit<EnterpriseCollaborationContext, 'loading'> {
  return {
    ragDocumentCount: data.ragDocumentCount,
    ragReady: data.ragDocumentCount > 0,
    skillCount: data.skillCount,
    skillNames: data.skillNames,
    enabledMcpCount: data.enabledMcpCount,
    mcpNames: data.mcpNames,
  };
}
