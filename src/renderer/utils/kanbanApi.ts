/**
 * kanbanApi — 统一 API 抽象
 * Electron 模式：走 IPC bridge
 * 浏览器模式（WebUI）：走 REST /api/kanban/*
 */
import { ipcBridge } from '@/common';
import type { IKanbanTask, IKanbanUser } from '@/common/adapter/ipcBridge';

export type { IKanbanTask, IKanbanUser };
export type KanbanRole = 'user' | 'admin';
export type KanbanMe = { id: string; username: string; role: KanbanRole };

const isElectron = (): boolean => typeof window !== 'undefined' && !!window.electronAPI;

/** Electron 桌面模式始终是 admin */
const ELECTRON_ME: KanbanMe = { id: 'system_default_user', username: 'Admin', role: 'admin' };

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
    credentials: 'include',
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? res.statusText);
  }
  const body = await res.json();
  return body.data ?? body;
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
export type AdminUser = { id: string; username: string; role: KanbanRole; created_at: number; last_login?: number | null };

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

  resetPassword: (id: string, password: string) =>
    isElectron()
      ? ipcBridge.adminUsers.resetPassword.invoke({ id, password })
      : apiFetch('/api/admin/users/' + id + '/password', { method: 'PATCH', body: JSON.stringify({ password }) }),

  deleteUser: (id: string) =>
    isElectron()
      ? ipcBridge.adminUsers.remove.invoke({ id })
      : apiFetch('/api/admin/users/' + id, { method: 'DELETE' }),
};
