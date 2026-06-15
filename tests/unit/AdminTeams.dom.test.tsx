import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useEnterpriseAsyncDataMock = vi.hoisted(() => vi.fn());
const updateTeamMock = vi.hoisted(() => vi.fn());
const messageSuccessMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string; name?: string }) => {
      if (options?.name && options?.defaultValue?.includes('{{name}}')) {
        return options.defaultValue.replace('{{name}}', options.name);
      }
      return options?.defaultValue || _key;
    },
  }),
}));

vi.mock('@arco-design/web-react', () => {
  const Input = ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => <input value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.currentTarget.value)} />;
  Input.TextArea = Input;

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

  const Modal = ({
    children,
    title,
    visible,
    onOk,
    onCancel,
    okText,
    cancelText,
  }: React.PropsWithChildren<{
    title?: React.ReactNode;
    visible?: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    okText?: React.ReactNode;
    cancelText?: React.ReactNode;
  }>) =>
    visible ? (
      <div>
        <div>{title}</div>
        {children}
        <button onClick={onOk}>{okText}</button>
        <button onClick={onCancel}>{cancelText}</button>
      </div>
    ) : null;

  const Table = ({
    data,
    columns,
  }: {
    data: Array<Record<string, unknown>>;
    columns: Array<{
      title?: React.ReactNode;
      dataIndex?: string;
      render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode;
    }>;
  }) => (
    <table>
      <tbody>
        {data.map((row, rowIndex) => (
          <tr key={String(row.id ?? rowIndex)}>
            {columns.map((column, columnIndex) => {
              const value = column.dataIndex ? row[column.dataIndex] : undefined;
              return (
                <td key={`${rowIndex}-${columnIndex}`}>
                  {column.render ? column.render(value, row) : (value as React.ReactNode)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const Select = ({
    children,
    value,
    onChange,
  }: React.PropsWithChildren<{
    value?: string;
    onChange?: (value: string) => void;
  }>) => (
    <select value={value} onChange={(event) => onChange?.(event.currentTarget.value)}>
      {children}
    </select>
  );
  Select.Option = ({ children, value }: React.PropsWithChildren<{ value: string }>) => (
    <option value={value}>{children}</option>
  );

  return {
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
      children,
      title,
      extra,
    }: React.PropsWithChildren<{ title?: React.ReactNode; extra?: React.ReactNode }>) => (
      <section>
        {title}
        {extra}
        {children}
      </section>
    ),
    Form,
    Input,
    Message: {
      error: vi.fn(),
      success: (...args: unknown[]) => messageSuccessMock(...args),
      warning: vi.fn(),
    },
    Modal,
    Popconfirm: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Select,
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Table,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  };
});

vi.mock('@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData', () => ({
  useEnterpriseAsyncData: (...args: unknown[]) => useEnterpriseAsyncDataMock(...args),
}));

vi.mock('@/renderer/utils/enterpriseApi/client', () => ({
  getEnterpriseActionError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  addTeamMember: vi.fn(),
  createTeam: vi.fn(),
  createTeamTask: vi.fn(),
  deleteTeamTask: vi.fn(),
  listTeamMembers: vi.fn(),
  listTeams: vi.fn(),
  listTeamTasks: vi.fn(),
  removeTeamMember: vi.fn(),
  updateTeam: (...args: unknown[]) => updateTeamMock(...args),
  updateTeamMemberRole: vi.fn(),
  updateTeamTask: vi.fn(),
}));

vi.mock('@/renderer/pages/admin/components/ModuleDataState', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/admin/components/ModulePageHeader', () => ({
  __esModule: true,
  default: ({ actions, title }: { actions?: React.ReactNode; title?: React.ReactNode }) => (
    <div>
      {title}
      {actions}
    </div>
  ),
}));

vi.mock('@/renderer/pages/admin/components/AdminPageWrapper', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/admin/components/TeamAddMemberModal', () => ({
  __esModule: true,
  default: () => null,
}));

import AdminTeams from '@/renderer/pages/admin/AdminTeams';

describe('AdminTeams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const reloadTeams = vi.fn();
    const reloadMembers = vi.fn();
    const reloadTasks = vi.fn();
    const states = [
      {
        data: [
          {
            id: 'team-1',
            name: 'Alpha',
            workspace: 'D:\\workspace\\alpha',
            workspace_mode: 'shared',
            user_id: 'u1',
            tenant_id: 'tenant-1',
            created_at: 1,
            updated_at: 2,
          },
        ],
        loading: false,
        error: null,
        reload: reloadTeams,
      },
      {
        data: [],
        loading: false,
        error: null,
        reload: reloadMembers,
      },
      {
        data: [],
        loading: false,
        error: null,
        reload: reloadTasks,
      },
    ];
    let callIndex = 0;
    useEnterpriseAsyncDataMock.mockImplementation(() => {
      const state = states[Math.min(callIndex, states.length - 1)];
      callIndex += 1;
      return state;
    });
    updateTeamMock.mockResolvedValue(undefined);
  });

  it('renames a team from the admin list and reloads teams', async () => {
    render(<AdminTeams />);

    fireEvent.click(screen.getByText('编辑团队'));
    fireEvent.change(screen.getByDisplayValue('Alpha'), {
      target: { value: 'Beta' },
    });
    fireEvent.click(screen.getByText('保存修改'));

    await waitFor(() => {
      expect(updateTeamMock).toHaveBeenCalledWith('team-1', { name: 'Beta' });
    });

    expect(messageSuccessMock).toHaveBeenCalledWith('团队已更新');
  });
});
