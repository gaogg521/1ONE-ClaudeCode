/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { getDatabase } from '@process/services/database/export';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { randomUUID } from 'node:crypto';
import { WebuiService } from './services/WebuiService';
import { logBridgeError } from './bridgeLog';

/** system_default_user 由 DB 初始化时 ensureSystemUser() 保证永远存在 */
const DESKTOP_USER_ID = 'system_default_user';
const DESKTOP_TENANT_ID = 'default';

export function initTaskBridge(workerTaskManager: IWorkerTaskManager): void {
  // 暂停所有运行中的任务 / Stop all running tasks
  ipcBridge.task.stopAll.provider(async () => {
    try {
      const tasks = workerTaskManager.listTasks();
      const stopPromises = tasks.map((taskInfo) => {
        const task = workerTaskManager.getTask(taskInfo.id);
        return task?.stop?.();
      });
      await Promise.allSettled(stopPromises);
      return { success: true, count: tasks.length };
    } catch (error) {
      logBridgeError('Failed to stop all tasks', error);
      return { success: false, count: 0 };
    }
  });

  // 获取运行中的任务数量 / Get count of running tasks
  ipcBridge.task.getRunningCount.provider(async () => {
    try {
      const tasks = workerTaskManager.listTasks();
      return { success: true, count: tasks.length };
    } catch (error) {
      logBridgeError('Failed to get running task count', error);
      return { success: false, count: 0 };
    }
  });

  // ─── 任务看板（个人任务，SQLite 持久化）────────────────────────────────────

  ipcBridge.kanban.list.provider(async () => {
    try {
      const db = await getDatabase();
      const result = db.listPersonalTasks(DESKTOP_TENANT_ID, DESKTOP_USER_ID);
      if (!result.success) throw new Error(result.error);
      return (result.data ?? []) as import('@/common/adapter/ipcBridge').IKanbanTask[];
    } catch (error) {
      logBridgeError('[KanbanBridge] list failed', error);
      return [];
    }
  });

  ipcBridge.kanban.create.provider(async (input) => {
    try {
      const db = await getDatabase();
      const now = Date.now();
      const task = {
        id: randomUUID(),
        tenant_id: DESKTOP_TENANT_ID,
        user_id: DESKTOP_USER_ID,
        subject: input.subject,
        status: input.status ?? 'pending',
        active_form: input.active_form,
        session_name: input.session_name,
        assigned_to: input.assigned_to,
        created_at: now,
        updated_at: now,
      };
      const result = db.createPersonalTask(task);
      if (!result.success) throw new Error(result.error);
      return task as import('@/common/adapter/ipcBridge').IKanbanTask;
    } catch (error) {
      logBridgeError('[KanbanBridge] create failed', error);
      throw error;
    }
  });

  ipcBridge.kanban.update.provider(async (input) => {
    try {
      const db = await getDatabase();
      const { id, ...updates } = input;
      const result = db.updatePersonalTask(id, updates);
      if (!result.success) throw new Error(result.error);
      return true;
    } catch (error) {
      logBridgeError('[KanbanBridge] update failed', error);
      return false;
    }
  });

  ipcBridge.kanban.remove.provider(async ({ id }) => {
    try {
      const db = await getDatabase();
      const result = db.deletePersonalTask(id);
      if (!result.success) throw new Error(result.error);
      return result.data ?? false;
    } catch (error) {
      logBridgeError('[KanbanBridge] remove failed', error);
      return false;
    }
  });

  ipcBridge.kanban.listUsers.provider(async () => {
    try {
      const db = await getDatabase();
      const result = db.getAllUsers();
      if (!result.success || !result.data) return [];
      return result.data.filter((u) => u.id !== DESKTOP_USER_ID).map((u) => ({ id: u.id, username: u.username }));
    } catch (error) {
      logBridgeError('[KanbanBridge] listUsers failed', error);
      return [];
    }
  });

  ipcBridge.kanban.me.provider(async () => {
    return { id: DESKTOP_USER_ID, username: 'Admin', role: 'admin' as const };
  });

  // ─── 用户管理（桌面 admin IPC）────────────────────────────────────────────
  // WebUI 管理接口走 HTTP + JWT + requireAdmin；此处为 Electron 单机会话，
  // 信任本机已登录用户，不额外追加企业后台二次验证。

  ipcBridge.adminUsers.list.provider(async () => {
    try {
      const users = await UserRepository.listUsers();
      return users
        .filter((u) => u.id !== DESKTOP_USER_ID)
        .map((u) => ({
          id: u.id,
          username: u.username,
          role: u.role === 'system_admin' || u.role === 'org_admin' ? ('admin' as const) : ('user' as const),
          created_at: u.created_at,
          last_login: u.last_login,
        }));
    } catch {
      return [];
    }
  });

  ipcBridge.adminUsers.create.provider(async ({ username, password, role }) => {
    const hash = await AuthService.hashPassword(password);
    const mappedRole = role === 'admin' ? 'org_admin' : 'member';
    const user = await UserRepository.createUserWithRole(username, hash, mappedRole);
    return { id: user.id, username: user.username, role };
  });

  ipcBridge.adminUsers.setRole.provider(async ({ id, role }) => {
    // 桌面端 IPC 传入 'user' | 'admin' | 'system_admin'，统一映射到 DB 角色。
    // 注意：'admin' 历史含义是 org_admin（部门管理员），不是 system_admin。
    const mappedRole: 'member' | 'org_admin' | 'system_admin' =
      role === 'system_admin' ? 'system_admin' : role === 'admin' ? 'org_admin' : 'member';
    await UserRepository.setRole(id, mappedRole);
    return true;
  });

  ipcBridge.adminUsers.sendResetPasswordCode.provider(async () => {
    const data = await WebuiService.requestResetPasswordEmailCode();
    return { maskedEmail: data.maskedEmail };
  });

  ipcBridge.adminUsers.resetPassword.provider(async ({ id, password, emailCode }) => {
    await WebuiService.resetUserPasswordWithEmailCode(id, password, emailCode);
    return true;
  });

  ipcBridge.adminUsers.remove.provider(async ({ id }) => {
    await UserRepository.deleteUser(id);
    return true;
  });
}
