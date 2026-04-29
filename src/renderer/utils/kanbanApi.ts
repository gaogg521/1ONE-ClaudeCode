/**
 * kanbanApi — 统一 API 抽象
 * Electron 模式：走 IPC bridge
 * 浏览器模式（WebUI）：走 REST /api/kanban/*
 */
import { ipcBridge } from '@/common';
import type { IKanbanTask, IKanbanUser } from '@/common/adapter/ipcBridge';
import { withCsrfToken } from '@process/webserver/middleware/csrfClient';

export type { IKanbanTask, IKanbanUser };
export type KanbanRole = 'user' | 'admin';
export type KanbanMe = { id: string; username: string; role: KanbanRole };

const isElectron = (): boolean => typeof window !== 'undefined' && !!window.electronAPI;

/** Electron 桌面模式始终是 admin */
const ELECTRON_ME: KanbanMe = { id: 'system_default_user', username: 'Admin', role: 'admin' };

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers = opts?.headers ? { 'Content-Type': 'application/json', ...opts.headers } : { 'Content-Type': 'application/json' };
  const method = String(opts?.method ?? 'GET').toUpperCase();
  const shouldAttachCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  let body = opts?.body;
  if (shouldAttachCsrf && typeof body === 'string') {
    try {
      body = JSON.stringify(withCsrfToken(JSON.parse(body)));
    } catch {
      // ignore if body is not JSON
    }
  }

  const res = await fetch(path, {
    headers,
    credentials: 'include',
    ...opts,
    body,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
    const msg = err.message ?? res.statusText;
    if (res.status === 403 && err.code === 'ENTERPRISE_ELEVATION_REQUIRED') {
      throw new Error(msg || 'Enterprise elevation required');
    }
    throw new Error(msg);
  }
  const respBody = await res.json();
  return respBody.data ?? respBody;
}

export const kanbanApi = {
  me: async (): Promise<KanbanMe> => {
    if (isElectron()) return ELECTRON_ME;
    return apiFetch<KanbanMe>('/api/kanban/me');
  },

  list: async (): Promise<IKanbanTask[]> => {
    if (isElectron()) return ipcBridge.kanban.list.invoke();
    return apiFetch<IKanbanTask[]>('/api/kanban/tasks');
  },

  create: async (input: {
    subject: string;
    status: string;
    active_form?: string;
    session_name?: string;
    assigned_to?: string;
  }): Promise<IKanbanTask> => {
    if (isElectron()) return ipcBridge.kanban.create.invoke(input);
    return apiFetch<IKanbanTask>('/api/kanban/tasks', { method: 'POST', body: JSON.stringify(input) });
  },

  update: async (input: {
    id: string;
    subject?: string;
    status?: string;
    active_form?: string;
    session_name?: string;
    assigned_to?: string;
  }): Promise<boolean> => {
    if (isElectron()) return ipcBridge.kanban.update.invoke(input);
    const { id, ...rest } = input;
    return apiFetch<boolean>(`/api/kanban/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(rest) });
  },

  remove: async (id: string): Promise<boolean> => {
    if (isElectron()) return ipcBridge.kanban.remove.invoke({ id });
    return apiFetch<boolean>(`/api/kanban/tasks/${id}`, { method: 'DELETE' });
  },

  listUsers: async (): Promise<IKanbanUser[]> => {
    if (isElectron()) return ipcBridge.kanban.listUsers.invoke();
    return apiFetch<IKanbanUser[]>('/api/kanban/users');
  },
};

// 用户管理 API（只在 WebUI 模式下使用）
export type AdminUser = {
  id: string;
  username: string;
  role: KanbanRole;
  created_at: number;
  last_login?: number | null;
  identities?: Array<{ provider: 'ldap' | 'feishu' | 'dingtalk' | 'wecom'; external_id: string }>;
  protected?: boolean;
};

export type AuthProviderId = 'ldap' | 'feishu' | 'dingtalk' | 'wecom';

export const adminApi = {
  listUsers: () =>
    isElectron()
      ? ipcBridge.adminUsers.list.invoke()
      : apiFetch<AdminUser[]>('/api/admin/users'),

  createUser: (username: string, password: string, role: KanbanRole) =>
    isElectron()
      ? ipcBridge.adminUsers.create.invoke({ username, password, role })
      : apiFetch<AdminUser>('/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password, role }) }),

  setRole: (id: string, role: KanbanRole) =>
    isElectron()
      ? ipcBridge.adminUsers.setRole.invoke({ id, role })
      : apiFetch('/api/admin/users/' + id + '/role', { method: 'PATCH', body: JSON.stringify({ role }) }),

  sendResetPasswordCode: () =>
    isElectron()
      ? ipcBridge.adminUsers.sendResetPasswordCode.invoke()
      : apiFetch<{ maskedEmail: string }>('/api/admin/users/reset-password-email-code', {
          method: 'POST',
          body: JSON.stringify({}),
        }),

  resetPassword: (id: string, password: string, emailCode: string) =>
    isElectron()
      ? ipcBridge.adminUsers.resetPassword.invoke({ id, password, emailCode })
      : apiFetch('/api/admin/users/' + id + '/password', {
          method: 'PATCH',
          body: JSON.stringify({ password, emailCode }),
        }),

  deleteUser: (id: string) =>
    isElectron()
      ? ipcBridge.adminUsers.remove.invoke({ id })
      : apiFetch('/api/admin/users/' + id, { method: 'DELETE' }),

  bindIdentity: (provider: AuthProviderId, userId: string, externalId: string) =>
    apiFetch('/api/admin/auth/identities', { method: 'POST', body: JSON.stringify({ provider, userId, externalId }) }),

  unbindIdentity: (provider: AuthProviderId, userId: string) =>
    apiFetch('/api/admin/auth/identities', { method: 'DELETE', body: JSON.stringify({ provider, userId }) }),
};
