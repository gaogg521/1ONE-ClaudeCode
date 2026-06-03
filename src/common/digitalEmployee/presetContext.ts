/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type DigitalEmployeePresetInput = {
  name: string;
  description?: string | null;
  instructions?: string | null;
};

/**
 * Build assistant rules injected as presetContext / presetRules on first message.
 */
export function buildDigitalEmployeePresetContext(input: DigitalEmployeePresetInput): string | undefined {
  const name = input.name.trim();
  if (!name) {
    return undefined;
  }
  const sections: string[] = [`你是数字员工「${name}」。`];
  const description = input.description?.trim();
  if (description) {
    sections.push(`职责概述：${description}`);
  }
  const instructions = input.instructions?.trim();
  if (instructions) {
    sections.push(instructions);
  }
  return sections.length > 1 ? sections.join('\n\n') : sections[0];
}
