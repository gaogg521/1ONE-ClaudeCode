import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.hoisted(() => vi.fn());
const editionFeaturesMock = vi.hoisted(() => vi.fn());
const listSkillsMock = vi.hoisted(() => vi.fn());
const listAvailableSkillsInvokeMock = vi.hoisted(() => vi.fn());
const previewSkillsFromUrlInvokeMock = vi.hoisted(() => vi.fn());
const importSkillFromUrlInvokeMock = vi.hoisted(() => vi.fn());
const messageSuccessMock = vi.hoisted(() => vi.fn());
const messageErrorMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; [key: string]: unknown }) => {
      const template = options?.defaultValue;
      if (!template) return _key;
      return Object.entries(options ?? {}).reduce((result, [key, value]) => {
        if (key === 'defaultValue') return result;
        return result.replaceAll(`{{${key}}}`, String(value ?? ''));
      }, template);
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/renderer/hooks/webui/useEditionFeatures', () => ({
  useEditionFeatures: () => editionFeaturesMock(),
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  listSkills: () => listSkillsMock(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listAvailableSkills: {
        invoke: listAvailableSkillsInvokeMock,
      },
      previewSkillsFromUrl: {
        invoke: previewSkillsFromUrlInvokeMock,
      },
      importSkillFromUrl: {
        invoke: importSkillFromUrlInvokeMock,
      },
    },
  },
}));

vi.mock('@/renderer/components/layout/PageContentShell', () => ({
  default: ({ children }: React.PropsWithChildren) => <div data-testid='page-content-shell'>{children}</div>,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({
    title,
    children,
    onClick,
  }: React.PropsWithChildren<{ title?: React.ReactNode; onClick?: () => void }>) => (
    <section onClick={onClick}>
      {title ? <div>{title}</div> : null}
      {children}
    </section>
  ),
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => <input value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} />,
  Message: {
    success: (...args: unknown[]) => messageSuccessMock(...args),
    error: (...args: unknown[]) => messageErrorMock(...args),
  },
  Modal: ({
    visible,
    title,
    children,
  }: React.PropsWithChildren<{ visible?: boolean; title?: React.ReactNode }>) =>
    visible ? (
      <div role='dialog'>
        <div>{title}</div>
        {children}
      </div>
    ) : null,
  Result: ({
    title,
    subTitle,
    extra,
  }: {
    title?: React.ReactNode;
    subTitle?: React.ReactNode;
    extra?: React.ReactNode;
  }) => (
    <div>
      <div>{title}</div>
      <div>{subTitle}</div>
      {extra}
    </div>
  ),
  Spin: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  Typography: {
    Paragraph: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  },
}));

import SkillsPage from '@/renderer/pages/skills';

describe('SkillsPage', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    messageSuccessMock.mockReset();
    messageErrorMock.mockReset();
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: true,
      can: (capability: string) => capability === 'skills.local' || capability === 'skills.org',
    });
    listAvailableSkillsInvokeMock.mockResolvedValue([
      {
        name: 'repo-debug',
        description: '排查仓库问题',
        location: '/skills/repo-debug/SKILL.md',
        directory: '/skills/repo-debug',
        runtimeFiles: ['SKILL.md'],
        sourceKind: 'custom',
      },
    ]);
    listSkillsMock.mockResolvedValue([
      {
        id: 'team-skill-1',
        name: 'team-oncall',
        description: '团队值班流程',
        content: 'team skill content',
        enabled: 1,
        scope: 'tenant',
        team_id: null,
        created_by: 'user-1',
        created_at: 1,
        updated_at: 2,
      },
    ]);
    previewSkillsFromUrlInvokeMock.mockResolvedValue({
      success: true,
      data: {
        sourceUrl: 'https://github.com/demo/skills',
        resolvedUrl: 'https://github.com/demo/skills/tree/main/repo-debug',
        cacheDir: '/tmp/preview',
        skills: [
          {
            name: 'preview-skill',
            description: '预览中的技能',
            location: '/tmp/preview/SKILL.md',
            directory: '/tmp/preview',
            runtimeFiles: ['SKILL.md'],
            sourceKind: 'external',
          },
        ],
      },
    });
    importSkillFromUrlInvokeMock.mockResolvedValue({
      success: true,
    });
  });

  it('keeps local skills available when user has not joined enterprise', async () => {
    editionFeaturesMock.mockReturnValue({
      hasJoinedEnterprise: false,
      can: (capability: string) => capability === 'skills.local',
    });

    render(<SkillsPage />);
    expect(await screen.findByText('repo-debug')).toBeInTheDocument();
    expect(screen.queryByText('team-oncall')).not.toBeInTheDocument();
    expect(screen.queryByText('打开团队技能后台')).not.toBeInTheDocument();

    expect(listSkillsMock).not.toHaveBeenCalled();
  });

  it('renders local and team skills and navigates to detail/admin pages', async () => {
    render(<SkillsPage />);

    expect(await screen.findByText('repo-debug')).toBeInTheDocument();
    expect(screen.getByText('team-oncall')).toBeInTheDocument();

    fireEvent.click(screen.getByText('repo-debug'));
    fireEvent.click(screen.getByText('打开团队技能后台'));

    expect(navigateMock).toHaveBeenNthCalledWith(1, '/skills/repo-debug');
    expect(navigateMock).toHaveBeenNthCalledWith(2, '/enterprise/skills');
  });

  it('supports preview and import from url', async () => {
    render(<SkillsPage />);
    fireEvent.click(screen.getByText('从 URL 导入'));

    fireEvent.change(screen.getByPlaceholderText('https://github.com/...'), {
      target: { value: 'https://github.com/demo/skills' },
    });
    fireEvent.click(screen.getByText('预览'));

    expect(await screen.findByText('preview-skill')).toBeInTheDocument();
    fireEvent.click(screen.getByText('导入'));

    await waitFor(() => {
      expect(importSkillFromUrlInvokeMock).toHaveBeenCalledWith({
        skillPath: '/tmp/preview',
      });
      expect(messageSuccessMock).toHaveBeenCalledWith('已导入技能「preview-skill」');
    });
  });
});
