import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useEnterpriseAsyncDataMock = vi.hoisted(() => vi.fn());
const updatePipelineMock = vi.hoisted(() => vi.fn());
const savePipelineMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue || _key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Delete: () => <span>delete</span>,
  Down: () => <span>down</span>,
  Edit: () => <span>edit</span>,
  Move: () => <span>move</span>,
  Plus: () => <span>plus</span>,
  Refresh: () => <span>refresh</span>,
  Save: () => <span>save</span>,
  Undo: () => <span>undo</span>,
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
  }) => (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  );
  Input.TextArea = ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (value: string) => void;
  }) => <textarea value={value} onChange={(event) => onChange?.(event.currentTarget.value)} />;

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

  return {
    Button: ({
      children,
      onClick,
    }: React.PropsWithChildren<{ onClick?: () => void }>) => <button onClick={onClick}>{children}</button>,
    Card: ({
      children,
      title,
    }: React.PropsWithChildren<{ title?: React.ReactNode }>) => (
      <section>
        {title}
        {children}
      </section>
    ),
    Divider: () => <hr />,
    Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
    Form,
    Input,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    },
    Modal: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Space: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Steps: Object.assign(
      ({ children }: React.PropsWithChildren) => <div>{children}</div>,
      {
        Step: ({ title }: { title?: React.ReactNode }) => <div>{title}</div>,
      }
    ),
    Switch: ({ checked }: { checked?: boolean }) => <span>{checked ? 'on' : 'off'}</span>,
    Tag: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    Typography: {
      Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    },
  };
});

vi.mock('@/renderer/hooks/enterprise/modules/useEnterpriseAsyncData', () => ({
  useEnterpriseAsyncData: (...args: unknown[]) => useEnterpriseAsyncDataMock(...args),
}));

vi.mock('@/renderer/utils/enterpriseApi/client', () => ({
  getEnterpriseActionError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/renderer/utils/enterpriseApi/modules', () => ({
  getPipelineRun: vi.fn(),
  listPipelines: vi.fn(),
  savePipeline: (...args: unknown[]) => savePipelineMock(...args),
  triggerPipelineRun: vi.fn(),
  updatePipeline: (...args: unknown[]) => updatePipelineMock(...args),
}));

vi.mock('@/renderer/pages/admin/components/ModuleDataState', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/admin/components/ModulePageHeader', () => ({
  __esModule: true,
  default: ({ actions, description }: { actions?: React.ReactNode; description?: React.ReactNode }) => (
    <div>
      {description}
      {actions}
    </div>
  ),
}));

vi.mock('@/renderer/pages/admin/components/AdminPageWrapper', () => ({
  __esModule: true,
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

import AdminPipelineEditor from '@/renderer/pages/admin/AdminPipelineEditor';

describe('AdminPipelineEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEnterpriseAsyncDataMock.mockReturnValue({
      data: [
        {
          id: 'pl-1',
          name: 'Main Release',
          enabled: 1,
          definition_json: JSON.stringify({
            stages: [
              {
                name: 'Lint',
                jobs: [
                  {
                    name: 'lint',
                    commands: ['npm run lint', 'npm run test'],
                  },
                ],
              },
            ],
          }),
        },
      ],
      loading: false,
      error: null,
      reload: vi.fn(),
    });
    updatePipelineMock.mockResolvedValue({ id: 'pl-1' });
    savePipelineMock.mockResolvedValue({ id: 'pl-2' });
  });

  it('shows product guidance and loads nested pipeline definitions into the simple editor', async () => {
    render(<AdminPipelineEditor />);

    expect(screen.getByText(/流水线编排、运行与质量闸口/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Main Release'));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Main Release')).toBeInTheDocument();
    });
    expect(screen.getByText(/npm run lint/)).toBeInTheDocument();
    expect(screen.getByText(/npm run test/)).toBeInTheDocument();
  });

  it('updates an existing pipeline instead of creating a new one when saving edits', async () => {
    render(<AdminPipelineEditor />);

    fireEvent.click(screen.getByText('Main Release'));
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => {
      expect(updatePipelineMock).toHaveBeenCalledWith(
        'pl-1',
        expect.objectContaining({
          name: 'Main Release',
          definition: expect.objectContaining({
            stages: [
              expect.objectContaining({
                name: 'Lint',
                jobs: [
                  expect.objectContaining({
                    commands: ['npm run lint', 'npm run test'],
                  }),
                ],
              }),
            ],
          }),
        })
      );
    });
    expect(savePipelineMock).not.toHaveBeenCalled();
  });
});
