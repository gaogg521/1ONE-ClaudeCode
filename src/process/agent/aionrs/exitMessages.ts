/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/** User-facing message when the aionrs child process exits mid-turn. */
export function formatAionrsProcessExitError(code: number | null, stderrTail?: string): string {
  const codeLabel = code === null ? 'unknown' : String(code);
  const stderrHint = stderrTail?.trim() ? `\n\n[aionrs stderr]\n${stderrTail.trim()}` : '';

  if (code === 0) {
    return (
      `[aionrs] 进程已结束（exit code 0），通常不是 API Key 或模型不可用。` +
      `常见原因：会话 worker 被重建（例如切换模型）、aionrs 内部正常退出但未返回 stream_end。` +
      `请直接重试；若仍失败，停止后新建对话。${stderrHint}`
    );
  }

  return (
    `[aionrs] 进程意外退出（exit code ${codeLabel}）。` +
    `可能原因：上下文超过模型限制、API 认证失败、网络或上游服务异常。` +
    `请重试或检查模型配置。${stderrHint}`
  );
}
