import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listSkillsMock = vi.hoisted(() => vi.fn());
const listMcpRegistryMock = vi.hoisted(() => vi.fn());
const listRagDocumentsMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  listSkills: () => listSkillsMock(),
  listMcpRegistry: () => listMcpRegistryMock(),
  listRagDocuments: () => listRagDocumentsMock(),
}));

import { useEnterpriseCollaborationContext } from '@/renderer/pages/superAssistant/hooks/useEnterpriseCollaborationContext';

describe('useEnterpriseCollaborationContext', () => {
  beforeEach(() => {
    listSkillsMock.mockReset();
    listMcpRegistryMock.mockReset();
    listRagDocumentsMock.mockReset();
    listSkillsMock.mockResolvedValue([
      { id: 'skill-1', name: 'PR Review' },
      { id: 'skill-2', name: 'Deploy Bot' },
    ]);
    listMcpRegistryMock.mockResolvedValue([
      { id: 'mcp-1', name: 'GitHub Actions', enabled: true },
      { id: 'mcp-2', name: 'Local Runner', enabled: false },
    ]);
    listRagDocumentsMock.mockResolvedValue([{ id: 'rag-1', title: '研发规范', chunk_count: 8 }]);
  });

  it('loads rag, skills, and enabled mcp summaries for collaboration flows', async () => {
    const { result } = renderHook(() => useEnterpriseCollaborationContext(true));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.ragDocumentCount).toBe(1);
    expect(result.current.ragReady).toBe(true);
    expect(result.current.skillCount).toBe(2);
    expect(result.current.skillNames).toEqual(['PR Review', 'Deploy Bot']);
    expect(result.current.enabledMcpCount).toBe(1);
    expect(result.current.mcpNames).toEqual(['GitHub Actions']);
  });

  it('returns empty context when enterprise collaboration is disabled', async () => {
    const { result } = renderHook(() => useEnterpriseCollaborationContext(false));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(listSkillsMock).not.toHaveBeenCalled();
    expect(result.current.ragDocumentCount).toBe(0);
    expect(result.current.skillNames).toEqual([]);
    expect(result.current.mcpNames).toEqual([]);
  });
});
