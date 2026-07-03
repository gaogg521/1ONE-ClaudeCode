/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ProcessChat } from '@process/utils/initStorage';
import type { TChatConversation } from '@/common/config/storage';
import { migrateConversationToDatabase } from './migrationUtils';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import { AuthService } from '@process/webserver/auth/service/AuthService';
import { UserRepository } from '@process/webserver/auth/repository/UserRepository';
import { getDatabase } from '@process/services/database';

export function initDatabaseBridge(repo: IConversationRepository): void {
  // Get conversation messages from database
  ipcBridge.database.getConversationMessages.provider(async (_params) => {
    const { conversation_id, page = 0, pageSize = 10000, __authToken } = (_params ?? {}) as {
      conversation_id?: string;
      page?: number;
      pageSize?: number;
      __authToken?: string | null;
    };
    try {
      // WebUI multi-user mode: enforce scope via token
      if (typeof __authToken === 'string' && __authToken.trim() !== '') {
        const decoded = await AuthService.verifyToken(__authToken);
        if (!decoded) return [];
        const user = await UserRepository.findById(decoded.userId);
        if (!user) return [];
        const tenantId = (user as any).tenant_id ?? 'default';
        const db = await getDatabase();
        if (!db.canUserAccessConversation({ tenantId, userId: user.id, conversationId: String(conversation_id ?? '') })) {
          return [];
        }
      }
      const result = await repo.getMessages(conversation_id, page, pageSize);
      return result.data;
    } catch (error) {
      // console.error here triggers @office-ai/platform's console patch → bridge.adapter.emit
      // → win.webContents.send × N + broadcastToAll. This IPC handler is invoked every 2.5s
      // by the renderer's message-sync poll (useAionrsMessage AIONRS_MESSAGE_SYNC_POLL_MS),
      // so a persistent error (e.g. client-mode token verify failing on remote-issued JWT)
      // freezes the main process. Write to file instead.
      try {
        const { appendFile, mkdirSync } = require('node:fs');
        const { join } = require('node:path');
        const { getPlatformServices } = require('@/common/platform');
        const logsDir = getPlatformServices().paths.getLogsDir();
        try { mkdirSync(logsDir, { recursive: true }); } catch {}
        appendFile(join(logsDir, 'database-bridge.log'),
          `[${new Date().toISOString()}] getConversationMessages error: ${error instanceof Error ? error.message : String(error)}\n`, 'utf-8', () => {});
      } catch {
        // best-effort
      }
      return [];
    }
  });

  // Get user conversations from database with lazy migration from file storage
  ipcBridge.database.getUserConversations.provider(async (_params) => {
    const { page = 0, pageSize = 10000, teamId, __authToken } = (_params ?? {}) as {
      page?: number;
      pageSize?: number;
      teamId?: string | null;
      __authToken?: string | null;
    };
    try {
      // WebUI multi-user mode: return only conversations visible to this user
      if (typeof __authToken === 'string' && __authToken.trim() !== '') {
        const decoded = await AuthService.verifyToken(__authToken);
        if (!decoded) return [];
        const user = await UserRepository.findById(decoded.userId);
        if (!user) return [];
        const tenantId = (user as any).tenant_id ?? 'default';
        const db = await getDatabase();
        const result = db.getAccessibleConversationsForUser({
          tenantId,
          userId: user.id,
          page,
          pageSize,
          teamId: typeof teamId === 'string' ? teamId : null,
        });
        return result.data;
      }

      const result = await repo.getUserConversations(undefined, page * pageSize, pageSize);
      const dbConversations = result.data;

      // Try to get conversations from file storage
      let fileConversations: TChatConversation[] = [];
      try {
        fileConversations = (await ProcessChat.get('chat.history')) || [];
      } catch {
        // No file-based conversations — first run or migration already complete.
        // Previously console.warn here; removed because console.* in IPC handlers
        // triggers bridge.adapter.emit which blocks the main process event loop
        // (see commit 4b9453c for the same root cause).
      }

      // Use database conversations as the primary source while backfilling missing ones from file storage
      // 以数据库结果为主，只补充文件中尚未迁移的会话，避免删除后出现"只剩更早记录"的问题
      // Build a map for fast lookup to avoid duplicates when merging
      const dbConversationMap = new Map(dbConversations.map((conv) => [conv.id, conv] as const));

      // Filter out conversations that already exist in database
      // 只保留文件里数据库没有的会话，确保不会重复
      const fileOnlyConversations = fileConversations.filter((conv) => !dbConversationMap.has(conv.id));

      // If there are conversations that only exist in file storage, migrate them in background
      // 对剩余会话做懒迁移，保证后续刷新直接使用数据库
      if (fileOnlyConversations.length > 0) {
        void Promise.all(fileOnlyConversations.map((conv) => migrateConversationToDatabase(conv)));
      }

      // Combine database conversations (source of truth) with any remaining file-only conversations
      // 返回数据库结果 + 未迁移会话，这样"今天"与"更早"记录都能稳定展示
      const allConversations = [...dbConversations, ...fileOnlyConversations];
      // Re-sort by modifyTime (or createTime as fallback) to maintain correct order
      allConversations.sort((a, b) => (b.modifyTime || b.createTime || 0) - (a.modifyTime || a.createTime || 0));
      return allConversations;
    } catch {
      // Error getting user conversations — return empty array so UI shows Empty state.
      // Previously console.error here; removed because console.* in IPC handlers
      // triggers bridge.adapter.emit which blocks the main process event loop.
      return [];
    }
  });

  ipcBridge.database.searchConversationMessages.provider(async (_params) => {
    const { keyword, page = 0, pageSize = 20, __authToken } = (_params ?? {}) as {
      keyword?: string;
      page?: number;
      pageSize?: number;
      __authToken?: string | null;
    };
    try {
      if (typeof __authToken === 'string' && __authToken.trim() !== '') {
        const decoded = await AuthService.verifyToken(__authToken);
        if (!decoded) {
          return { items: [], total: 0, page, pageSize, hasMore: false };
        }
        const user = await UserRepository.findById(decoded.userId);
        if (!user) {
          return { items: [], total: 0, page, pageSize, hasMore: false };
        }
        const tenantId = (user as { tenant_id?: string }).tenant_id ?? 'default';
        const db = await getDatabase();
        return db.searchConversationMessagesAccessible({
          tenantId,
          userId: user.id,
          keyword: String(keyword ?? ''),
          page,
          pageSize,
        });
      }
      const result = await repo.searchMessages(keyword, page, pageSize);
      return result;
    } catch (error) {
      // IPC handler — never use console.* (triggers bridge.adapter.emit, freezes main process on repeated calls). Write to file.
      try {
        const { appendFile, mkdirSync } = require('node:fs');
        const { join } = require('node:path');
        const { getPlatformServices } = require('@/common/platform');
        const logsDir = getPlatformServices().paths.getLogsDir();
        try { mkdirSync(logsDir, { recursive: true }); } catch {}
        appendFile(join(logsDir, 'database-bridge.log'),
          `[${new Date().toISOString()}] searchMessages error: ${error instanceof Error ? error.message : String(error)}\n`, 'utf-8', () => {});
      } catch {
        // best-effort
      }
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
  });
}
