/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

type ToolConfirmationLike = {
  name?: string;
  description?: string;
  confirmationDetails?: {
    type?: string;
    command?: string;
    toolName?: string;
    prompt?: string;
    title?: string;
  };
};

const IMAGE_TOOL_NAMES = new Set(['one_image_generation', 'ImageGeneration']);

function confirmationBlob(content: ToolConfirmationLike): string {
  const parts = [
    content.name,
    content.description,
    content.confirmationDetails?.command,
    content.confirmationDetails?.prompt,
    content.confirmationDetails?.title,
    content.confirmationDetails?.toolName,
  ];
  return parts.filter((part) => typeof part === 'string' && part.trim()).join('\n');
}

/** Builtin image analyze/generate tools are safe to auto-approve in default permission mode. */
export function shouldAutoApproveToolConfirmation(content: ToolConfirmationLike): boolean {
  const name = content.name ?? content.confirmationDetails?.toolName ?? '';
  if (IMAGE_TOOL_NAMES.has(name)) {
    return true;
  }

  const blob = confirmationBlob(content);
  if (!blob) {
    return false;
  }

  if (/Analyze image/i.test(blob) || /Generate image/i.test(blob) || /Edit image/i.test(blob)) {
    return true;
  }

  if (/image_uris/i.test(blob) && /"prompt"\s*:/i.test(blob)) {
    return true;
  }

  return false;
}
