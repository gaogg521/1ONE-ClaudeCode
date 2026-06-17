/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** Hidden agent prompt when the user sends attachments without text. */
export const DEFAULT_ATTACHMENT_ANALYSIS_PROMPT =
  'Please analyze the attached file(s), summarize the key information, and answer in the same language as the user.';

const ATTACHMENT_REFERENCE_RE =
  /解读|分析|说明|总结|看看|附件|这个\s*(pdf|PDF|文件|文档|图片|图)|这份|文件内容|图片内容|attached|attachment|summarize|analyze|explain|what\s+is\s+this/i;

/** Whether a follow-up message likely refers to a recently uploaded attachment. */
export function messageReferencesRecentAttachments(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return ATTACHMENT_REFERENCE_RE.test(trimmed);
}
