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

/** system_default_user 由 DB 初始化时 ensureSystemUser() 保证永远存在 */
const DESKTOP_USER_ID = 'system_default_user';

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
      console.error('Failed to stop all tasks:', error);
      return { success: false, count: 0 };
    }
  });

  // 获取运行中的任务数量 / Get count of running tasks
  ipcBridge.task.getRunningCount.provider(async () => {
    try {
      const tasks = workerTaskManager.listTasks();
      return { success: true, count: tasks.length };
    } catch (error) {
      console.error('Failed to get running task count:', error);
      return { success: false, count: 0 };
    }
  });

  // ─── 任务看板（个人任务，SQLite 持久化）────────────────────────────────────

  ipcBridge.kanban.list.provider(async () => {
    try {
      const db = await getDatabase();
      const result = db.listPersonalTasks();
      if (!result.success) throw new Error(result.error);
      return (result.data ?? []) as import('@/common/adapter/ipcBridge').IKanbanTask[];
    } catch (error) {
      console.error('[KanbanBridge] list failed:', error);
      return [];
    }
  });

  ipcBridge.kanban.create.provider(async (input) => {
    try {
      const db = await getDatabase();
      const now = Date.now();
      const task = {
        id: randomUUID(),
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
      console.error('[KanbanBridge] create failed:', error);
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
      console.error('[KanbanBridge] update failed:', error);
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
      console.error('[KanbanBridge] remove failed:', error);
      return false;
    }
  });

  ipcBridge.kanban.listUsers.provider(async () => {
    try {
      const db = await getDatabase();
      const result = db.getAllUsers();
      if (!result.success || !result.data) return [];
      return result.data
        .filter((u) => u.id !== DESKTOP_USER_ID)
        .map((u) => ({ id: u.id, username: u.username }));
    } catch (error) {
      console.error('[KanbanBridge] listUsers failed:', error);
      return [];
    }
  });

  ipcBridge.kanban.me.provider(async () => {
    return { id: DESKTOP_USER_ID, username: 'Admin', role: 'admin' as const };
  });

  // ─── 用户管理（桌面 admin IPC）────────────────────────────────────────────

  ipcBridge.adminUsers.list.provider(async () => {
    try {
      const users = await UserRepository.listUsers();
      return users
        .filter((u) => u.id !== DESKTOP_USER_ID)
        .map((u) => ({ id: u.id, username: u.username, role: u.role ?? ('user' as const), created_at: u.created_at, last_login: u.last_login }));
    } catch { return []; }
  });

  ipcBridge.adminUsers.create.provider(async ({ username, password, role }) => {
    const hash = await AuthService.hashPassword(password);
    const user = await UserRepository.createUserWithRole(username, hash, role);
    return { id: user.id, username: user.username, role: user.role };
  });

  ipcBridge.adminUsers.setRole.provider(async ({ id, role }) => {
    await UserRepository.setRole(id, role);
    return true;
  });

  ipcBridge.adminUsers.resetPassword.provider(async ({ id, password }) => {
    const hash = await AuthService.hashPassword(password);
    await UserRepository.updatePassword(id, hash);
    return true;
  });

  ipcBridge.adminUsers.remove.provider(async ({ id }) => {
    await UserRepository.deleteUser(id);
    return true;
  });
}

