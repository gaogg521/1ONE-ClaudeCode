import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useEnterpriseAsyncDataMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: { defaultValue?: string; message?: string }
    ) => options?.defaultValue?.replace('{{message}}', options?.message ?? '') || _key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Delete: () => <span>delete</span>,
  Plus: () => <span>plus</span>,
  Search: () => <span>search</span>,
}));

vi.mock('@arco-design/web-react', () => {
  const Input = ({ value, onChange, placeholder }: { value?: string; onChange?: (value: string) => void; placeholder?: string }) => (
    <input value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.currentTarget.value)} />
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
  (Form as unknown as { useForm: () => [{ resetFields: () => void; validate: () => Promise<{ title: string; content: string }> }] }).useForm = () => [
    {
      resetFields: () => undefined,
      validate: async () => ({ title: 'title', content: 'content' }),
    },
  ];

  const Typography = {
    Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  };

  return {
    Button: ({ children }: React.PropsWithChildren) => <button>{children}</button>,
    Card: ({ children, title, extra }: React.PropsWithChildren<{ title?: React.ReactNode; extra?: React.ReactNode }>) => (
      <section>
        {title}
        {extra}
        {children}
      </section>
    ),
    Form,
    Input,
    InputNumber: ({ value }: { value?: number }) => <span>{value}</span>,
    List: ({ header, noDataElement, dataSource, render }: { header?: React.ReactNode; noDataElement?: React.ReactNode; dataSource?: unknown[]; render?: (item: any, index: number) => React.ReactNode }) => (
      <div>
        {header}
        {(dataSource?.length ?? 0) > 0 ? dataSource?.map((item, index) => render?.(item, index)) : noDataElement}
      </div>
    ),
    Message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    Modal: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Popconfirm: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Table: ({ data, columns }: { data?: any[]; columns?: Array<{ render?: (value: unknown, record: any) => React.ReactNode; dataIndex?: string }> }) => (
      <div>
        {data?.map((record, rowIndex) => (
          <div key={record.id ?? rowIndex}>
            {columns?.map((column, columnIndex) => (
              <div key={columnIndex}>
                {column.render ? column.render(column.dataIndex ? record[column.dataIndex] : undefined, record) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Typography,
  };
});

vi.mock('@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData', () => ({
  useEnterpriseAsyncData: (...args: unknown[]) => useEnterpriseAsyncDataMock(...args),
}));

vi.mock('@/renderer/utils/enterpriseApi/client', () => ({
  getEnterpriseActionError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  createRagDocument: vi.fn(),
  deleteRagDocument: vi.fn(),
  importRagFeishuDocument: vi.fn(),
  importRagUrl: vi.fn(),
  listRagDocuments: vi.fn(),
  queryRagDocuments: vi.fn(),
  uploadRagDocument: vi.fn(),
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

import AdminRag from '@/renderer/pages/admin/AdminRag';

describe('AdminRag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnterpriseAsyncDataMock.mockReturnValue({
      data: [
        {
          id: 'doc-1',
          title: '飞书团队规范',
          file_path: 'https://sample.feishu.cn/docx/AbCdEf123456',
          status: 'failed',
          chunk_count: 0,
          scope: 'organization',
          last_error: 'tenant_access_token invalid',
        },
      ],
      loading: false,
      error: null,
      reload: vi.fn(),
    });
  });

  it('shows failed reason and separate actions for URL and Feishu imports', () => {
    render(<AdminRag />);

    expect(screen.getByText('URL 导入')).toBeInTheDocument();
    expect(screen.getByText('企业飞书导入')).toBeInTheDocument();
    expect(screen.getByText(/失败原因/)).toBeInTheDocument();
    expect(screen.getByText(/tenant_access_token invalid/)).toBeInTheDocument();
  });
});
