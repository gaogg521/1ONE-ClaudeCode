import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMemberDashboardMock = vi.hoisted(() => vi.fn());
const kanbanMeMock = vi.hoisted(() => vi.fn());

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  listMemberDashboard: () => listMemberDashboardMock(),
}));

vi.mock('@/renderer/utils/kanbanApi', () => ({
  adminApi: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    resetPassword: vi.fn(),
    setRole: vi.fn(),
    bindIdentity: vi.fn(),
    unbindIdentity: vi.fn(),
    sendResetEmailCode: vi.fn(),
    resetPasswordByEmail: vi.fn(),
  },
  kanbanApi: {
    me: () => kanbanMeMock(),
  },
}));

vi.mock('@icon-park/react', () => ({
  Add: () => <span>add</span>,
  DeleteFour: () => <span>delete</span>,
  Refresh: () => <span>refresh</span>,
  Key: () => <span>key</span>,
  Link: () => <span>link</span>,
  CloseSmall: () => <span>close</span>,
}));

vi.mock('@arco-design/web-react', () => {
  const Input = ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <input value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />
  );
  Input.TextArea = ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <textarea value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />
  );
  Input.Password = ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <input type='password' value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />
  );

  const Form = Object.assign(({ children }: React.PropsWithChildren) => <form>{children}</form>, {
    Item: ({ label, children }: React.PropsWithChildren<{ label?: React.ReactNode }>) => (
      <label>
        {label}
        {children}
      </label>
    ),
  });

  return {
    Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <button type='button' onClick={onClick}>
        {children}
      </button>
    ),
    Form,
    Input,
    Message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
    Modal: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Popconfirm: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Select: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
      Option: ({ children }: React.PropsWithChildren) => <option>{children}</option>,
    }),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Spin: ({ tip }: { tip?: string }) => <div>{tip}</div>,
    Table: ({
      data,
      columns,
    }: {
      data: Array<Record<string, unknown>>;
      columns: Array<{
        title?: string;
        dataIndex?: string;
        key?: string;
        render?: (value: unknown, record: Record<string, unknown>) => React.ReactNode;
      }>;
    }) => (
      <table>
        <tbody>
          {data.map((row) => (
            <tr key={String(row.id)}>
              {columns.map((column) => (
                <td key={column.key ?? column.dataIndex}>
                  {column.render
                    ? column.render(row[column.dataIndex ?? ''], row)
                    : String(row[column.dataIndex ?? ''] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ),
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  };
});

import UsersPage from '@/renderer/pages/users/index';

describe('UsersPage profile mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kanbanMeMock.mockResolvedValue({ id: 'user-1', username: 'alice', role: 'member' });
    listMemberDashboardMock.mockResolvedValue([
      {
        id: 'user-1',
        username: 'alice',
        role: 'member',
        last_login: Date.now(),
        is_online: true,
        tasks_total: 4,
        tasks_completed: 2,
        tasks_in_progress: 1,
      },
      {
        id: 'user-2',
        username: 'bob',
        role: 'member',
        last_login: 0,
        is_online: false,
        tasks_total: 0,
        tasks_completed: 0,
        tasks_in_progress: 0,
      },
    ]);
  });

  it('loads team peers for enterprise members', async () => {
    render(<UsersPage enterpriseAccess='profile' />);

    await waitFor(() => {
      expect(listMemberDashboardMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('团队成员')).toBeTruthy();
    expect(screen.getByText('alice')).toBeTruthy();
    expect(screen.getByText('bob')).toBeTruthy();
    expect(screen.getByText('在线')).toBeTruthy();
    expect(screen.getByText('2/4 已完成')).toBeTruthy();
  });
});
