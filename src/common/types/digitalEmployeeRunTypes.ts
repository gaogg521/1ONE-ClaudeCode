/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type DigitalEmployeeRunStatus = 'running' | 'success' | 'failed';

export type DigitalEmployeeRunRecord = {
  runId: string;
  conversationId: string;
  startedAt: number;
  finishedAt?: number;
  status: DigitalEmployeeRunStatus;
  error?: string;
  summary?: string;
};

export const DIGITAL_EMPLOYEE_RUN_HISTORY_MAX = 20;

export function appendDigitalEmployeeRunHistory(
  existing: DigitalEmployeeRunRecord[] | undefined,
  entry: DigitalEmployeeRunRecord
): DigitalEmployeeRunRecord[] {
  const prior = Array.isArray(existing) ? existing : [];
  return [entry, ...prior].slice(0, DIGITAL_EMPLOYEE_RUN_HISTORY_MAX);
}
