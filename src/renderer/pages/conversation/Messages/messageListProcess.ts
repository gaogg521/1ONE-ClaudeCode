/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate, IMessageAcpToolCall, IMessageToolGroup, TMessage } from '@/common/chat/chatLib';
import { collectWebSourcesFromToolMessages, type WebSourceItem } from '@/renderer/utils/web/collectWebSourcesFromTools';
import { parseDiff } from '@renderer/pages/conversation/Messages/codex/MessageFileChanges';
import type { FileChangeInfo } from '@renderer/pages/conversation/Messages/codex/MessageFileChanges';
import type { WriteFileResult } from '@renderer/pages/conversation/Messages/types';

type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;

export type IMessageVO =
  | TMessage
  | { type: 'file_summary'; id: string; diffs: FileChangeInfo[]; sourceMessageIds: string[] }
  | {
      type: 'tool_summary';
      id: string;
      messages: Array<IMessageToolGroup | IMessageAcpToolCall>;
      sourceMessageIds: string[];
    }
  | { type: 'web_sources'; id: string; sources: WebSourceItem[]; sourceMessageIds: string[] };

const INCREMENTAL_TAIL_TYPES = new Set<TMessage['type']>(['text', 'thinking', 'agent_status', 'tips', 'plan']);

const SUMMARY_TYPES = new Set(['file_summary', 'tool_summary', 'web_sources']);

export function getProcessedItemSourceMessageIds(item: IMessageVO): string[] {
  if ('type' in item && item.type === 'tool_summary') {
    return item.sourceMessageIds;
  }
  if ('type' in item && item.type === 'file_summary') {
    return item.sourceMessageIds;
  }
  if ('type' in item && item.type === 'web_sources') {
    return item.sourceMessageIds;
  }
  return 'id' in item ? [item.id] : [];
}

export function matchesTargetMessage(item: IMessageVO, targetMessageId?: string): boolean {
  if (!targetMessageId) {
    return false;
  }
  return getProcessedItemSourceMessageIds(item).includes(targetMessageId);
}

export function getProcessedItemAnchorId(item: IMessageVO, fallbackId: () => string): string {
  const sourceIds = getProcessedItemSourceMessageIds(item);
  return sourceIds[0] || ('id' in item ? item.id : fallbackId());
}

/** Pre-process raw messages into Virtuoso rows (tool groups, file diffs, web sources). */
export function buildProcessedMessageList(list: TMessage[]): IMessageVO[] {
  const result: Array<IMessageVO> = [];
  let diffsChanges: FileChangeInfo[] = [];
  let diffsSourceMessageIds: string[] = [];
  let toolList: Array<IMessageToolGroup | IMessageAcpToolCall> = [];
  let toolSourceMessageIds: string[] = [];

  const pushFileDffChanges = (changes: FileChangeInfo, sourceMessageId: string) => {
    if (!diffsChanges.length) {
      diffsSourceMessageIds = [];
      result.push({
        type: 'file_summary',
        id: `summary-${sourceMessageId}`,
        diffs: diffsChanges,
        sourceMessageIds: diffsSourceMessageIds,
      });
    }
    diffsChanges.push(changes);
    diffsSourceMessageIds.push(sourceMessageId);
    toolList = [];
    toolSourceMessageIds = [];
  };
  const pushWebSourcesBeforeReply = (anchorMessageId: string) => {
    if (!toolList.length) {
      return;
    }
    const sources = collectWebSourcesFromToolMessages(toolList);
    if (sources.length > 0) {
      result.push({
        type: 'web_sources',
        id: `web-sources-${anchorMessageId}`,
        sources,
        sourceMessageIds: [...toolSourceMessageIds],
      });
    }
  };

  const pushToolList = (message: IMessageToolGroup | IMessageAcpToolCall) => {
    if (!toolList.length) {
      toolSourceMessageIds = [];
      result.push({
        type: 'tool_summary',
        id: `tool-summary-${message.id}`,
        messages: toolList,
        sourceMessageIds: toolSourceMessageIds,
      });
    }
    toolList.push(message);
    toolSourceMessageIds.push(message.id);
    diffsChanges = [];
    diffsSourceMessageIds = [];
  };

  for (let i = 0, len = list.length; i < len; i++) {
    const message = list[i];
    if (message.hidden) continue;
    if (message.type === 'available_commands') continue;
    if (message.type === 'codex_tool_call' && message.content.subtype === 'turn_diff') {
      pushFileDffChanges(parseDiff((message.content as TurnDiffContent).data.unified_diff), message.id);
      continue;
    }
    if (message.type === 'tool_group') {
      if (message.content.length === 1) {
        const writeFileResults = message.content
          .filter(
            (item) =>
              item.name === 'WriteFile' &&
              item.resultDisplay &&
              typeof item.resultDisplay === 'object' &&
              'fileDiff' in item.resultDisplay
          )
          .map((item) => item.resultDisplay as WriteFileResult);
        if (writeFileResults.length && writeFileResults[0].fileDiff) {
          pushFileDffChanges(parseDiff(writeFileResults[0].fileDiff, writeFileResults[0].fileName), message.id);
          continue;
        }
      }
      pushToolList(message);
      continue;
    }
    if (message.type === 'acp_tool_call') {
      pushToolList(message);
      continue;
    }
    pushWebSourcesBeforeReply(message.id);
    toolList = [];
    toolSourceMessageIds = [];
    diffsChanges = [];
    diffsSourceMessageIds = [];
    result.push(message);
  }
  if (toolList.length > 0) {
    pushWebSourcesBeforeReply(toolSourceMessageIds[toolSourceMessageIds.length - 1] ?? 'tail');
  }
  return result;
}

function isGroupingTailMessage(message: TMessage): boolean {
  if (message.type === 'tool_group' || message.type === 'acp_tool_call') return true;
  return message.type === 'codex_tool_call' && message.content.subtype === 'turn_diff';
}

/** True when only the tail row changed — safe to patch processed list without full scan. */
export function canIncrementallyUpdateProcessedList(prev: TMessage[], next: TMessage[]): boolean {
  if (!prev.length || !next.length || next.length < prev.length) return false;

  const sharedPrefixLength = next.length === prev.length ? prev.length - 1 : prev.length;
  for (let i = 0; i < sharedPrefixLength; i++) {
    if (prev[i] !== next[i]) return false;
  }

  if (next.length === prev.length) {
    const last = next[next.length - 1];
    return INCREMENTAL_TAIL_TYPES.has(last.type);
  }

  const added = next[next.length - 1];
  if (!INCREMENTAL_TAIL_TYPES.has(added.type)) return false;
  const prevLast = prev[prev.length - 1];
  return !isGroupingTailMessage(prevLast);
}

function isSummaryItem(item: IMessageVO): boolean {
  return 'type' in item && SUMMARY_TYPES.has(item.type);
}

/** Patch or append the last processed row after a streaming tail update. */
export function updateProcessedMessageListTail(
  processed: IMessageVO[],
  prev: TMessage[],
  next: TMessage[]
): IMessageVO[] | null {
  if (!canIncrementallyUpdateProcessedList(prev, next)) return null;

  if (next.length === prev.length) {
    const lastMsg = next[next.length - 1];
    if (!processed.length) return null;
    const lastProcessed = processed[processed.length - 1];
    if (isSummaryItem(lastProcessed)) return null;
    if ((lastProcessed as TMessage).id !== lastMsg.id) return null;
    if (processed.length === 1) return [lastMsg];
    return [...processed.slice(0, -1), lastMsg];
  }

  const added = next[next.length - 1];
  return [...processed, added];
}
