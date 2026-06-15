/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TokenUsageData } from '@/common/config/storage';
import type { TChatConversation } from '@/common/config/storage';
import { getDatabase } from '@process/services/database';
export type AgentTokenUsageRow = {
  agentKey: string;
  agentName: string;
  source: 'personal' | 'team' | 'session';
  ownerUserId?: string;
  conversationCount: number;
  totalTokens: number;
  lastActivityAt: number;
};

type ConversationExtraSlice = {
  personalAgentId?: string;
  agentName?: string;
  teamId?: string;
  cronJobId?: string;
  lastTokenUsage?: TokenUsageData;
};

function parseExtra(extra: unknown): ConversationExtraSlice {
  if (!extra || typeof extra !== 'object') {
    return {};
  }
  return extra as ConversationExtraSlice;
}

function readTokenTotal(extra: ConversationExtraSlice): number {
  const usage = extra.lastTokenUsage;
  if (!usage || typeof usage.totalTokens !== 'number') {
    return 0;
  }
  return Math.max(0, usage.totalTokens);
}

function resolveAgentKey(
  conv: TChatConversation,
  extra: ConversationExtraSlice
): { key: string; name: string; source: AgentTokenUsageRow['source'] } {
  if (extra.personalAgentId) {
    return {
      key: `personal:${extra.personalAgentId}`,
      name: extra.agentName ?? conv.name,
      source: 'personal',
    };
  }
  const teamId = conv.type === 'acp' ? ((conv.extra as ConversationExtraSlice)?.teamId ?? extra.teamId) : extra.teamId;
  if (teamId && extra.agentName) {
    return {
      key: `team:${teamId}:${extra.agentName}`,
      name: extra.agentName,
      source: 'team',
    };
  }
  if (extra.agentName) {
    return {
      key: `session:${extra.agentName}`,
      name: extra.agentName,
      source: 'session',
    };
  }
  return {
    key: `session:${conv.id}`,
    name: conv.name,
    source: 'session',
  };
}

/**
 * Aggregate per-agent token usage for a tenant from conversation.extra.lastTokenUsage.
 * Note: stores latest snapshot per conversation (not per-turn history); costs are not computed yet.
 */
export async function aggregateAgentTokenUsageForTenant(
  tenantId: string,
  options: { sinceMs?: number; limit?: number } = {}
): Promise<AgentTokenUsageRow[]> {
  const sinceMs = options.sinceMs ?? Date.now() - 30 * 24 * 60 * 60 * 1000;
  const db = await getDatabase();
  const driver = db.getDriver();
  const rows = driver
    .prepare(
      `SELECT id, name, type, extra, user_id, updated_at
       FROM conversations
       WHERE tenant_id = ? AND updated_at >= ?
       ORDER BY updated_at DESC
       LIMIT ?`
    )
    .all(tenantId, sinceMs, options.limit ?? 5000) as Array<{
    id: string;
    name: string;
    type: string;
    extra: string;
    user_id: string;
    updated_at: number;
  }>;

  const personalNameById = new Map<string, string>();
  const personalRows = driver
    .prepare('SELECT id, name FROM personal_agents WHERE tenant_id = ?')
    .all(tenantId) as Array<{ id: string; name: string }>;
  for (const row of personalRows) {
    personalNameById.set(row.id, row.name);
  }

  const buckets = new Map<string, AgentTokenUsageRow>();

  for (const row of rows) {
    let extra: ConversationExtraSlice = {};
    try {
      extra = parseExtra(JSON.parse(row.extra));
    } catch {
      extra = {};
    }
    const conv = {
      id: row.id,
      name: row.name,
      type: row.type,
      extra,
    } as TChatConversation;
    const resolved = resolveAgentKey(conv, extra);
    const displayName =
      extra.personalAgentId && personalNameById.get(extra.personalAgentId)
        ? personalNameById.get(extra.personalAgentId)!
        : resolved.name;
    const tokens = readTokenTotal(extra);
    const existing = buckets.get(resolved.key);
    if (existing) {
      existing.conversationCount += 1;
      existing.totalTokens += tokens;
      existing.lastActivityAt = Math.max(existing.lastActivityAt, row.updated_at);
    } else {
      buckets.set(resolved.key, {
        agentKey: resolved.key,
        agentName: displayName,
        source: resolved.source,
        ownerUserId: row.user_id,
        conversationCount: 1,
        totalTokens: tokens,
        lastActivityAt: row.updated_at,
      });
    }
  }

  return [...buckets.values()].toSorted((a, b) => b.totalTokens - a.totalTokens);
}
