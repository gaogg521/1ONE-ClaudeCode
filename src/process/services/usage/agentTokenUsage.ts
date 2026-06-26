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
  /** Model of the most recent conversation for this agent (may be empty). */
  model?: string;
  /** Total messages across this agent's conversations (interaction count). */
  callCount: number;
  /** Messages with status 'error' (used for success/failure rate). */
  errorCount: number;
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

/**
 * conversations.model may hold a full provider-config JSON (with apiKey etc.), not a plain
 * model name. Extract just the active model label — never leak the raw blob into the payload.
 */
function parseModelLabel(raw: string | null | undefined): string | undefined {
  const v = (raw ?? '').trim();
  if (!v) {
    return undefined;
  }
  if (v.startsWith('{')) {
    try {
      const obj = JSON.parse(v) as { useModel?: unknown; model?: unknown };
      const picked =
        (typeof obj.useModel === 'string' && obj.useModel) ||
        (Array.isArray(obj.model) && typeof obj.model[0] === 'string' && obj.model[0]) ||
        '';
      return picked ? String(picked).slice(0, 60) : undefined;
    } catch {
      return undefined;
    }
  }
  return v.slice(0, 60);
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
  const teamId = conv.type === 'acp' ? (conv.extra as ConversationExtraSlice)?.teamId ?? extra.teamId : extra.teamId;
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
      `SELECT c.id, c.name, c.type, c.extra, c.user_id, c.updated_at, c.model,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS msg_total,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.status = 'error') AS msg_error
       FROM conversations c
       WHERE c.tenant_id = ? AND c.updated_at >= ?
       ORDER BY c.updated_at DESC
       LIMIT ?`
    )
    .all(tenantId, sinceMs, options.limit ?? 5000) as Array<{
    id: string;
    name: string;
    type: string;
    extra: string;
    user_id: string;
    updated_at: number;
    model: string | null;
    msg_total: number;
    msg_error: number;
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
    const msgTotal = Math.max(0, Number(row.msg_total) || 0);
    const msgError = Math.max(0, Number(row.msg_error) || 0);
    const model = parseModelLabel(row.model);
    const existing = buckets.get(resolved.key);
    if (existing) {
      existing.conversationCount += 1;
      existing.totalTokens += tokens;
      existing.callCount += msgTotal;
      existing.errorCount += msgError;
      existing.lastActivityAt = Math.max(existing.lastActivityAt, row.updated_at);
      // rows are DESC by updated_at, so the first non-empty model seen is the most recent.
      if (!existing.model && model) {
        existing.model = model;
      }
    } else {
      buckets.set(resolved.key, {
        agentKey: resolved.key,
        agentName: displayName,
        source: resolved.source,
        ownerUserId: row.user_id,
        conversationCount: 1,
        totalTokens: tokens,
        lastActivityAt: row.updated_at,
        model,
        callCount: msgTotal,
        errorCount: msgError,
      });
    }
  }

  return [...buckets.values()].toSorted((a, b) => b.totalTokens - a.totalTokens);
}
