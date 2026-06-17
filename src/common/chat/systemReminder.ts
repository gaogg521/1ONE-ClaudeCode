/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** Tag format that aionrs / Claude agents reliably honor (same as model-identity reminders). */
export const SYSTEM_REMINDER_TAG = 'system-reminder';

export function wrapSystemReminder(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return '';
  }
  return `<${SYSTEM_REMINDER_TAG}>\n${trimmed}\n</${SYSTEM_REMINDER_TAG}>\n\n`;
}
