import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useEnterpriseAsyncDataMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Delete: () => <span>delete</span>,
  Edit: () => <span>edit</span>,
  Plus: () => <span>plus</span>,
  Refresh: () => <span>refresh</span>,
}));

vi.mock('@arco-design/web-react', () => {
  const Input = ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <input value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />
  );
  Input.TextArea = ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <textarea value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />
  );

  const Form = ({ children }: React.PropsWithChildren) => <form>{children}</form>;
  (Form as unknown as { Item: React.FC<React.PropsWithChildren<{ label?: React.ReactNode }>> }).Item = ({
    label,
    children,
  }: React.PropsWithChildren<{ label?: React.ReactNode }>) => (
    <label>
      {label}
      {children}
    </label>
  );

  const Select = ({ children }: React.PropsWithChildren) => <select>{children}</select>;
  Select.Option = ({ children, value }: React.PropsWithChildren<{ value: string }>) => (
    <option value={value}>{children}</option>
  );

  return {
    Button: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
    Card: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
    Form,
    Input,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    Modal: ({ children, visible }: React.PropsWithChildren<{ visible?: boolean }>) =>
      visible === false ? null : <div>{children}</div>,
    Popconfirm: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Select,
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Switch: ({ checked }: { checked?: boolean }) => <span>{checked ? 'on' : 'off'}</span>,
    Table: ({
      data,
      columns,
    }: {
      data?: any[];
      columns?: Array<{ render?: (value: unknown, record: any) => React.ReactNode; dataIndex?: string }>;
    }) => (
      <div>
        {data?.map((record, rowIndex) => (
          <div key={record.id ?? rowIndex}>
            {columns?.map((column, columnIndex) => (
              <div key={columnIndex}>
                {column.render
                  ? column.render(column.dataIndex ? record[column.dataIndex] : undefined, record)
                  : column.dataIndex
                    ? record[column.dataIndex]
                    : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  };
});

vi.mock('@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData', () => ({
  useEnterpriseAsyncData: (...args: unknown[]) => useEnterpriseAsyncDataMock(...args),
}));

vi.mock('@/renderer/utils/enterpriseApi/client', () => ({
  getEnterpriseActionError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => ({ effectiveRole: 'org_admin' }),
}));

vi.mock('@/renderer/hooks/enterprise/useTeamNameMap', () => ({
  useTeamNameMap: () => ({
    getTeamName: (id: string | null | undefined) => id ?? '—',
    teams: [],
    teamsLoading: false,
  }),
}));

vi.mock('@/renderer/pages/admin/components/ScopeOwnershipCell', () => ({
  __esModule: true,
  default: ({
    scope,
    teamId,
    createdBy,
    getTeamName,
  }: {
    scope?: string;
    teamId?: string | null;
    createdBy?: string;
    getTeamName: (id: string | null | undefined) => string;
  }) => (
    <div>
      <span>{scope === 'team' ? '团队共享' : scope === 'organization' ? '组织共享' : '个人'}</span>
      {teamId ? <span>{`团队：${getTeamName(teamId)}`}</span> : null}
      <span>{`创建者：${createdBy || '—'}`}</span>
    </div>
  ),
}));

vi.mock('@/renderer/pages/admin/components/ResourceScopeFields', () => ({
  __esModule: true,
  default: () => <div>scope-fields</div>,
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  deleteSkill: vi.fn(),
  importSkillsBatch: vi.fn(),
  listSkills: vi.fn(),
  listTeams: vi.fn(),
  saveSkill: vi.fn(),
}));

vi.mock('@/renderer/pages/admin/components/AdminPageWrapper', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/admin/components/ModuleDataState', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/admin/components/ModulePageHeader', () => ({
  __esModule: true,
  default: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}));

import AdminSkills from '@/renderer/pages/admin/AdminSkills';

describe('AdminSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let callIndex = 0;
    useEnterpriseAsyncDataMock.mockImplementation(() => {
      callIndex += 1;
      if (callIndex === 1) {
        return {
          data: [
            {
              id: 'skill-1',
              name: '团队知识同步',
              description: '共享团队约定',
              content: '# content',
              enabled: 1,
              scope: 'team',
              team_id: 'team-alpha',
              created_by: 'alice',
            },
            {
              id: 'skill-2',
              name: '组织规范审查',
              description: '组织级别共享',
              content: '# content',
              enabled: 1,
              scope: 'organization',
              team_id: null,
              created_by: 'bob',
            },
          ],
          loading: false,
          error: null,
          reload: vi.fn(),
        };
      }
      return { data: [], loading: false, error: null, reload: vi.fn() };
    });
  });

  it('shows scope, team and creator ownership metadata for admin overview', () => {
    render(<AdminSkills />);

    expect(screen.getByText('团队共享')).toBeInTheDocument();
    expect(screen.getByText('团队：team-alpha')).toBeInTheDocument();
    expect(screen.getByText('创建者：alice')).toBeInTheDocument();
    expect(screen.getByText('组织共享')).toBeInTheDocument();
    expect(screen.getByText('创建者：bob')).toBeInTheDocument();
  });
});
