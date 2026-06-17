/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { appendDigitalEmployeeRunHistory, type DigitalEmployeeRunRecord } from '@/common/types/digitalEmployeeRunTypes';

export type DigitalEmployeeRunCarrier = {
  lastRun?: DigitalEmployeeRunRecord;
  runHistory?: DigitalEmployeeRunRecord[];
};

export function withNewDigitalEmployeeRun<T extends DigitalEmployeeRunCarrier>(
  carrier: T,
  runRecord: DigitalEmployeeRunRecord
): T {
  return {
    ...carrier,
    lastRun: runRecord,
    runHistory: appendDigitalEmployeeRunHistory(carrier.runHistory, runRecord),
  };
}

export function withFinishedDigitalEmployeeRun<T extends DigitalEmployeeRunCarrier>(
  carrier: T,
  match: { runId?: string; conversationId?: string },
  patch: Pick<DigitalEmployeeRunRecord, 'status' | 'error' | 'summary'>
): T {
  const finishedAt = Date.now();
  const shouldUpdate = (record: DigitalEmployeeRunRecord): boolean => {
    if (match.runId && record.runId === match.runId) {
      return true;
    }
    if (match.conversationId && record.conversationId === match.conversationId && record.status === 'running') {
      return true;
    }
    return false;
  };

  const updateRecord = (record: DigitalEmployeeRunRecord): DigitalEmployeeRunRecord =>
    shouldUpdate(record) ? { ...record, ...patch, finishedAt } : record;

  const lastRun = carrier.lastRun;
  const nextLastRun = lastRun && shouldUpdate(lastRun) ? updateRecord(lastRun) : lastRun;
  const history = Array.isArray(carrier.runHistory) ? carrier.runHistory.map(updateRecord) : [];

  return {
    ...carrier,
    lastRun: nextLastRun,
    runHistory: history,
  };
}
