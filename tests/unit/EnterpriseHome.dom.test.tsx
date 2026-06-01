import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const useEnterpriseRuntimeMock = vi.hoisted(() => vi.fn());
const useWebuiEnterpriseModeMock = vi.hoisted(() => vi.fn());
const listMcpRegistryMock = vi.hoisted(() => vi.fn());
const listRagDocumentsMock = vi.hoisted(() => vi.fn());
const listPipelinesMock = vi.hoisted(() => vi.fn());
const listCodeReposMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  }),
}));

vi.mock('@/renderer/hooks/enterprise/useEnterpriseRuntime', () => ({
  useEnterpriseRuntime: () => useEnterpriseRuntimeMock(),
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => useWebuiEnterpriseModeMock(),
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  listMcpRegistry: () => listMcpRegistryMock(),
  listRagDocuments: () => listRagDocumentsMock(),
  listPipelines: () => listPipelinesMock(),
  listCodeRepos: () => listCodeReposMock(),
}));

import EnterpriseHome from '@/renderer/pages/enterprise/EnterpriseHome';

describe('EnterpriseHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    useWebuiEnterpriseModeMock.mockReturnValue({
      enterpriseContext: {
        tenantId: 'tenant-acme',
        tenantName: 'Acme Corp',
      },
    });
    useEnterpriseRuntimeMock.mockReturnValue({
      openVerifyModal: vi.fn(),
      visibleNavItems: [
        {
          key: 'cteam',
          path: '/enterprise/cteam',
          labelKey: 'nav.cteam',
          labelDefault: 'CTeam 敏捷协同',
        },
        {
          key: 'rag',
          path: '/enterprise/rag',
          labelKey: 'nav.rag',
          labelDefault: '知识库配置',
        },
        {
          key: 'mcp',
          path: '/enterprise/mcp',
          labelKey: 'nav.mcp',
          labelDefault: 'MCP 外部集成',
        },
        {
          key: 'pipeline-editor',
          path: '/enterprise/pipeline-editor',
          labelKey: 'nav.pipeline',
          labelDefault: '流水线编排器',
        },
        {
          key: 'ccode',
          path: '/enterprise/ccode',
          labelKey: 'nav.ccode',
          labelDefault: '代码库',
        },
      ],
    });
    listMcpRegistryMock.mockResolvedValue([]);
    listRagDocumentsMock.mockResolvedValue([]);
    listPipelinesMock.mockResolvedValue([]);
    listCodeReposMock.mockResolvedValue([]);
  });

  it('loads overview metrics for enterprise admins without secondary verification', async () => {
    render(<EnterpriseHome />);

    await waitFor(() => {
      expect(listMcpRegistryMock).toHaveBeenCalledTimes(1);
      expect(listRagDocumentsMock).toHaveBeenCalledTimes(1);
      expect(listPipelinesMock).toHaveBeenCalledTimes(1);
      expect(listCodeReposMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText('完成二次验证后显示')).toBeNull();
  });

  it('opens enterprise modules directly instead of forcing a verification modal', async () => {
    const openVerifyModal = vi.fn();
    useEnterpriseRuntimeMock.mockReturnValue({
      openVerifyModal,
      visibleNavItems: [
        {
          key: 'mcp',
          path: '/enterprise/mcp',
          labelKey: 'nav.mcp',
          labelDefault: 'MCP 外部集成',
        },
      ],
    });

    render(<EnterpriseHome />);

    fireEvent.click(screen.getByText('MCP 外部集成'));

    expect(openVerifyModal).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/enterprise/mcp');
  });

  it('provides quick links back to the shared workspace shell', () => {
    render(<EnterpriseHome />);

    fireEvent.click(screen.getByText('Issues'));
    fireEvent.click(screen.getByText('Sessions'));
    fireEvent.click(screen.getByText('Agent 助手'));
    fireEvent.click(screen.getByText('Skills'));
    fireEvent.click(screen.getByText('Workspace'));
    fireEvent.click(screen.getByText('Tasks'));

    expect(navigateMock).toHaveBeenNthCalledWith(1, '/issues');
    expect(navigateMock).toHaveBeenNthCalledWith(2, '/sessions');
    expect(navigateMock).toHaveBeenNthCalledWith(3, '/super-assistant');
    expect(navigateMock).toHaveBeenNthCalledWith(4, '/skills');
    expect(navigateMock).toHaveBeenNthCalledWith(5, '/workspace');
    expect(navigateMock).toHaveBeenNthCalledWith(6, '/tasks');
  });
});
