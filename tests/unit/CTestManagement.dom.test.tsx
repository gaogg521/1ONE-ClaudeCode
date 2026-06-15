import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTestPlansMock = vi.hoisted(() => vi.fn());
const listTestCasesMock = vi.hoisted(() => vi.fn());
const listRequirementsTreeMock = vi.hoisted(() => vi.fn());
const updateTestCaseMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Plus: () => <span>plus</span>,
  Refresh: () => <span>refresh</span>,
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  listTestPlans: () => listTestPlansMock(),
  listTestCases: (planId: string) => listTestCasesMock(planId),
  listRequirementsTree: () => listRequirementsTreeMock(),
  createTestPlan: vi.fn(),
  createTestCase: vi.fn(),
  updateTestCase: (...args: unknown[]) => updateTestCaseMock(...args),
}));

vi.mock('@/renderer/pages/admin/components/AdminPageWrapper', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/admin/components/ModulePageHeader', () => ({
  default: ({ title, actions }: { title: React.ReactNode; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}));

vi.mock('@/renderer/pages/admin/components/ModuleDataState', () => ({
  default: ({
    children,
    empty,
    emptyDescription,
  }: React.PropsWithChildren<{ empty?: boolean; emptyDescription?: string }>) =>
    empty ? <div>{emptyDescription}</div> : <>{children}</>,
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({
    children,
    onClick,
    disabled,
  }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button type='button' disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );

  const Input = ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <input value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />
  );
  Input.TextArea = ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
    <textarea value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />
  );

  const Card = ({
    children,
    title,
    extra,
  }: React.PropsWithChildren<{ title?: React.ReactNode; extra?: React.ReactNode }>) => (
    <section>
      <div>{title}</div>
      {extra}
      {children}
    </section>
  );

  const Table = ({
    data,
    columns,
  }: {
    data: Array<Record<string, unknown>>;
    columns: Array<{
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
              <td key={column.dataIndex ?? column.key}>
                {column.render
                  ? column.render(row[column.dataIndex ?? ''], row)
                  : String(row[column.dataIndex ?? ''] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return {
    Button,
    Card,
    Form: Object.assign(({ children }: React.PropsWithChildren) => <form>{children}</form>, {
      Item: ({ label, children }: React.PropsWithChildren<{ label?: React.ReactNode }>) => (
        <label>
          {label}
          {children}
        </label>
      ),
    }),
    Grid: {
      Row: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
      Col: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    },
    Input,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    Modal: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Select: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
      Option: ({ children }: React.PropsWithChildren) => <option>{children}</option>,
    }),
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Table,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  };
});

import CTestManagement from '@/renderer/pages/admin/CTestManagement';

describe('CTestManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listTestPlansMock.mockResolvedValue([{ id: 'plan-1', name: '回归测试', description: 'v2.0', status: 'active' }]);
    listTestCasesMock.mockResolvedValue([
      {
        id: 'case-1',
        plan_id: 'plan-1',
        subject: '登录跳转首页',
        steps: '输入账号密码',
        expected: '进入首页',
        status: 'pending',
        assigned_to: '',
      },
    ]);
    listRequirementsTreeMock.mockResolvedValue([
      {
        id: 'story-1',
        type: 'story',
        subject: '用户登录',
        children: [],
      },
    ]);
    updateTestCaseMock.mockResolvedValue(undefined);
  });

  it('auto-selects the first plan and loads its test cases', async () => {
    render(<CTestManagement />);

    await waitFor(() => {
      expect(listTestCasesMock).toHaveBeenCalledWith('plan-1');
    });

    expect(screen.getByText('登录跳转首页')).toBeTruthy();
  });

  it('marks a pending test case as passed', async () => {
    render(<CTestManagement />);

    await waitFor(() => {
      expect(screen.getByText('登录跳转首页')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('通过'));

    await waitFor(() => {
      expect(updateTestCaseMock).toHaveBeenCalledWith('case-1', { status: 'passed' });
    });
    expect(listTestCasesMock.mock.calls.length).toBeGreaterThan(1);
  });
});
