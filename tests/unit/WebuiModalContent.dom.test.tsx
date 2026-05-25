import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getStatusInvokeMock = vi.hoisted(() => vi.fn());
const setAdminEmailInvokeMock = vi.hoisted(() => vi.fn());
const openExternalInvokeMock = vi.hoisted(() => vi.fn());
const configGetMock = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string; time?: string }) => {
      if (options?.defaultValue) return options.defaultValue;
      if (options?.time) return `${key}:${options.time}`;
      return key;
    },
  }),
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => configGetMock(...args),
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  shell: {
    openExternal: {
      invoke: (...args: unknown[]) => openExternalInvokeMock(...args),
    },
  },
  webui: {
    getStatus: {
      invoke: (...args: unknown[]) => getStatusInvokeMock(...args),
    },
    setAdminEmail: {
      invoke: (...args: unknown[]) => setAdminEmailInvokeMock(...args),
    },
    statusChanged: {
      on: () => () => {},
    },
    resetPasswordResult: {
      on: () => () => {},
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: vi.fn(),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    visible,
    onOk,
    onCancel,
    children,
    title,
  }: React.PropsWithChildren<{
    visible?: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    title?: string;
  }>) =>
    visible ? (
      <div>
        <h2>{title}</h2>
        {children}
        <button type='button' onClick={onCancel}>
          cancel
        </button>
        <button type='button' onClick={onOk}>
          ok
        </button>
      </div>
    ) : null,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/hooks/webui/useWebuiEnterpriseMode', () => ({
  useWebuiEnterpriseMode: () => ({
    loading: false,
    hasJoinedEnterprise: true,
  }),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('@/renderer/pages/settings/WebuiSettings/WebuiJoinEnterprisePanel', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/pages/settings/WebuiSettings/WebuiStandaloneBanner', () => ({
  default: () => <div />,
}));

vi.mock('@/renderer/components/layout/EditionModeSwitcher', () => ({
  default: () => <div />,
}));

vi.mock('@icon-park/react', () => ({
  Communication: () => <span />,
  Copy: () => <span>copy</span>,
  Earth: () => <span />,
  EditTwo: () => <span>edit</span>,
  Refresh: () => <span>refresh</span>,
}));

vi.mock('@arco-design/web-react', () => {
  const FormContext = React.createContext<{
    values: Record<string, unknown>;
    setFieldsValue: (values: Record<string, unknown>) => void;
    validate: () => Promise<Record<string, unknown>>;
    resetFields: () => void;
    getFieldValue: (field: string) => unknown;
  } | null>(null);

  const Form = ({
    children,
    form,
  }: React.PropsWithChildren<{
    form?: {
      values: Record<string, unknown>;
      setFieldsValue: (values: Record<string, unknown>) => void;
      validate: () => Promise<Record<string, unknown>>;
      resetFields: () => void;
      getFieldValue: (field: string) => unknown;
    };
  }>) => <FormContext.Provider value={form ?? null}>{children}</FormContext.Provider>;
  Form.useForm = () => {
    const form = {
      values: {} as Record<string, unknown>,
      setFieldsValue(values: Record<string, unknown>) {
        this.values = { ...this.values, ...values };
      },
      async validate() {
        return this.values;
      },
      resetFields() {
        this.values = {};
      },
      getFieldValue(field: string) {
        return this.values[field];
      },
    };
    return [form];
  };
  Form.Item = ({
    children,
    field,
  }: React.PropsWithChildren<{
    field?: string;
  }>) => {
    const form = React.useContext(FormContext);
    if (field && form && React.isValidElement(children)) {
      return (
        <div>
          {React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            value: String(form.values[field] ?? ''),
            onChange: (value: string) => {
              form.values[field] = value;
            },
          })}
        </div>
      );
    }
    return <div>{children}</div>;
  };

  const Button = ({
    children,
    onClick,
    htmlType,
  }: React.PropsWithChildren<{ onClick?: () => void; htmlType?: 'button' | 'submit' }>) => (
    <button type={htmlType || 'button'} onClick={onClick}>
      {children}
    </button>
  );

  const Input = ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => <input value={value} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />;
  Input.Password = Input;

  const Tabs = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  Tabs.TabPane = ({ children }: React.PropsWithChildren) => <div>{children}</div>;

  const Collapse = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  Collapse.Item = ({ children }: React.PropsWithChildren) => <div>{children}</div>;

  return {
    Button,
    Collapse,
    Form,
    Input,
    Message: {
      error: vi.fn(),
      success: vi.fn(),
    },
    Switch: ({ checked }: { checked?: boolean }) => <input type='checkbox' checked={checked} readOnly />,
    Tabs,
    Tooltip: ({ content, children }: React.PropsWithChildren<{ content?: React.ReactNode }>) => (
      <div data-tooltip={String(content ?? '')}>{children}</div>
    ),
  };
});

import WebuiModalContent from '@/renderer/components/settings/SettingsModal/contents/WebuiModalContent';

describe('WebuiModalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockResolvedValue(false);
    Object.defineProperty(window, 'electronAPI', {
      value: {
        webuiGetStatus: (...args: unknown[]) => getStatusInvokeMock(...args),
        webuiSetAdminEmail: (...args: unknown[]) => setAdminEmailInvokeMock(...args),
      },
      configurable: true,
    });
    getStatusInvokeMock.mockResolvedValue({
      success: true,
      data: {
        running: true,
        port: 25809,
        allowRemote: false,
        localUrl: 'http://localhost:25809',
        adminUsername: 'admin',
        adminEmail: 'admin@example.com',
      },
    });
    setAdminEmailInvokeMock.mockResolvedValue({ success: true });
  });

  it('shows the current admin email and saves it through the existing bridge action', async () => {
    render(<WebuiModalContent />);

    await waitFor(() => {
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    });

    const emailEditButton = document.querySelector('[data-tooltip="settings.webui.editAdminEmailTooltip"] button') as HTMLButtonElement;
    expect(emailEditButton).toBeTruthy();

    fireEvent.click(emailEditButton);

    await waitFor(() => {
      expect(screen.getByText('settings.webui.setAdminEmail')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('settings.webui.adminEmailPlaceholder'), {
      target: { value: 'admin@example.com' },
    });
    fireEvent.click(screen.getByText('ok'));

    await waitFor(() => {
      expect(setAdminEmailInvokeMock).toHaveBeenCalledWith('admin@example.com');
    });
  });
});
