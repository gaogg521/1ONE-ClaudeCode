import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMilestoneMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@arco-design/web-react', () => {
  const Form = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  Form.Item = ({ label, children }: React.PropsWithChildren<{ label?: string }>) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );

  const Input = ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => <input aria-label={placeholder || 'input'} value={value} onChange={(e) => onChange(e.target.value)} />;
  Input.TextArea = ({
    value,
    onChange,
  }: {
    value?: string;
    onChange: (value: string) => void;
  }) => <textarea aria-label='textarea' value={value} onChange={(e) => onChange(e.target.value)} />;

  return {
    Button: ({ children, onClick }: React.PropsWithChildren<{ onClick?: () => void }>) => (
      <button type='button' onClick={onClick}>
        {children}
      </button>
    ),
    Card: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Drawer: () => null,
    Empty: () => <div />,
    Form,
    Input,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
    Modal: ({
      visible,
      title,
      children,
      onOk,
      onCancel,
      okText,
      cancelText,
    }: React.PropsWithChildren<{
      visible?: boolean;
      title?: string;
      onOk?: () => void;
      onCancel?: () => void;
      okText?: string;
      cancelText?: string;
    }>) =>
      visible ? (
        <div>
          <h2>{title}</h2>
          {children}
          <button type='button' onClick={onCancel}>
            {cancelText}
          </button>
          <button type='button' onClick={onOk}>
            {okText}
          </button>
        </div>
      ) : null,
    Progress: () => <div />,
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Typography: {
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
      Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
    },
  };
});

vi.mock('@icon-park/react', () => ({
  Plus: () => <span />,
  Refresh: () => <span />,
}));

vi.mock('@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData', () => ({
  useEnterpriseAsyncData: () => ({
    data: [],
    loading: false,
    error: null,
    reload: vi.fn(),
    setData: vi.fn(),
  }),
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  createMilestone: (...args: unknown[]) => createMilestoneMock(...args),
  listMilestones: vi.fn(),
}));

vi.mock('@/renderer/pages/admin/components/AdminPageWrapper', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/admin/components/ModuleDataState', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/admin/components/ModulePageHeader', () => ({
  default: ({ actions }: { actions?: React.ReactNode }) => <div>{actions}</div>,
}));

import MilestoneView from '@/renderer/pages/admin/MilestoneView';

describe('MilestoneView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createMilestoneMock.mockResolvedValue(undefined);
  });

  it('submits the typed due_date string when it matches the milestone format', async () => {
    render(<MilestoneView />);

    fireEvent.click(screen.getByText('新建里程碑'));
    fireEvent.change(screen.getByLabelText('v1.11.0'), {
      target: { value: '2026Q3 版本' },
    });
    fireEvent.change(screen.getByLabelText('YYYY-MM-DD'), {
      target: { value: '2026-06-30' },
    });
    fireEvent.click(screen.getByText('创建'));

    await waitFor(() => {
      expect(createMilestoneMock).toHaveBeenCalledWith({
        name: '2026Q3 版本',
        description: '',
        due_date: '2026-06-30',
      });
    });
  });
});
