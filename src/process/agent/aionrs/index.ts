/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { TProviderWithModel } from '@/common/config/storage';
import { resolveAionrsBinary } from './binaryResolver';
import { buildSpawnConfig } from './envBuilder';
import type { AionrsEvent, AionrsCommand } from './protocol';
import { getEnhancedEnv, withNpxCommandOnPath } from '@process/utils/shellEnv';

const AIONRS_PROJECT_CONFIG = '.aionrs.toml';

type StreamEventHandler = (event: { type: string; data: unknown; msg_id: string }) => void;

export type AionrsAgentOptions = {
  workspace: string;
  model: TProviderWithModel;
  /** 1ONE conversation id — used when resume fails to start a fresh aionrs session with a stable key. */
  conversation_id?: string;
  proxy?: string;
  yoloMode?: boolean;
  presetRules?: string;
  maxTokens?: number;
  maxTurns?: number;
  sessionId?: string;
  resume?: string;
  onStreamEvent: StreamEventHandler;
};

export class AionrsAgent {
  /**
   * Sliding window: no JSON event from aionrs binary for this long → synthetic error + finish.
   *
   * - Plain chat / first token: upstream should return first chunk within 90 s even for slow models.
   *   If nothing comes back in 90 s the API connection is almost certainly broken (context overflow,
   *   rate limit, network loss).  Previously 5 min — that made a stuck turn feel like a 7-min hang.
   */
  private static readonly RESPONSE_STALL_MS = 90_000; // 90 s — first token timeout
  /**
   * While a tool is waiting for approval or executing locally, aionrs may emit nothing to stdout
   * (e.g. a slow build, npm install, git clone). Keep generous to avoid killing real work.
   */
  private static readonly STALL_DURING_TOOL_MS = 900_000; // 15 minutes
  /**
   * After a tool result the model must decide what to do next.  Even with a large context (e.g.
   * large partial output from a timed-out dir), the upstream API should respond within 90 s.
   * Reduced from 5 min — main culprit for 7-min frozen turns after tool timeouts.
   */
  private static readonly STALL_AFTER_TOOL_RESULT_MS = 90_000; // 90 s

  private childProcess: ChildProcess | null = null;
  private ready = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (err: Error) => void;
  private onStreamEvent: StreamEventHandler;
  private options: AionrsAgentOptions;
  private activeMsgId: string | null = null;
  private configBackup: { path: string; content: string | null } | null = null;
  public sessionId?: string;
  /** Last user message id for this turn — used when upstream events omit msg_id. */
  private pendingTurnMsgId: string | null = null;
  private responseStallTimer: NodeJS.Timeout | null = null;

  constructor(options: AionrsAgentOptions) {
    this.options = options;
    this.onStreamEvent = options.onStreamEvent;
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
  }

  get bootstrap(): Promise<void> {
    return this.readyPromise;
  }

  async start(): Promise<void> {
    const binaryPath = resolveAionrsBinary();
    if (!binaryPath) {
      throw new Error('aionrs binary not found');
    }

    const { args, env, projectConfig } = buildSpawnConfig(this.options.model, {
      workspace: this.options.workspace,
      maxTokens: this.options.maxTokens,
      maxTurns: this.options.maxTurns,
      autoApprove: this.options.yoloMode,
      sessionId: this.options.sessionId,
      resume: this.options.resume,
    });

    // Write temporary .aionrs.toml for provider compat overrides
    if (projectConfig) {
      this.writeProjectConfig(projectConfig);
    }

    // Merge shell-like PATH (Program Files\nodejs, npm global, Git, etc.) so MCP stdio
    // (e.g. chrome-devtools via `npx`) can spawn — raw process.env is often too thin on
    // Windows when Electron is launched from an IDE.
    // Ensure `npx` is on PATH: aionrs spawns MCP with bare `npx` (not absolute); Windows IDE launches
    // often miss Node's directory even when getEnhancedEnv() merged common paths.
    const childEnv = withNpxCommandOnPath(getEnhancedEnv());
    this.childProcess = spawn(binaryPath, args, {
      env: { ...childEnv, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.options.workspace,
    });

    // Parse stdout JSON Lines
    const rl = createInterface({ input: this.childProcess.stdout! });
    rl.on('line', (line) => {
      try {
        const event = JSON.parse(line) as AionrsEvent;
        this.handleEvent(event);
      } catch {
        console.error('[AionrsAgent] Failed to parse event:', line);
      }
    });

    // Log stderr as diagnostics
    this.childProcess.stderr?.on('data', (chunk: Buffer) => {
      console.error('[aionrs]', chunk.toString());
    });

    // Handle process exit
    this.childProcess.on('exit', (code) => {
      this.clearResponseStallTimer();
      this.restoreProjectConfig();

      if (!this.ready) {
        // Exited before emitting ready — reject the bootstrap promise
        this.readyReject(new Error(`aionrs exited with code ${code} during init`));
      } else {
        // Exited mid-conversation (context overflow, upstream crash, API auth failure, etc.).
        // Unblock the UI immediately so the user sees an error rather than an infinite spinner.
        const msgId = this.activeMsgId || this.pendingTurnMsgId || '';
        if (msgId) {
          this.onStreamEvent({
            type: 'error',
            data: `[aionrs] 进程意外退出（exit code ${code}）。可能原因：上下文超过模型限制、API 认证失败或上游服务异常。请重试或检查模型配置。`,
            msg_id: msgId,
          });
          this.onStreamEvent({ type: 'finish', data: '', msg_id: msgId });
          this.activeMsgId = null;
          this.pendingTurnMsgId = null;
        }
      }

      this.childProcess = null;
    });

    // Wait for ready event with timeout
    const timeout = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('aionrs ready timeout (30s)')), 30000);
    });

    try {
      await Promise.race([this.readyPromise, timeout]);
    } catch (err) {
      // If resume failed (session not found), fallback to a new session
      if (this.options.resume) {
        console.error('[AionrsAgent] Resume failed, falling back to new session:', err);
        const stableId = this.options.conversation_id ?? this.options.sessionId;
        this.options = { ...this.options, resume: undefined, sessionId: stableId };
        this.ready = false;
        this.readyPromise = new Promise((resolve, reject) => {
          this.readyResolve = resolve;
          this.readyReject = reject;
        });
        return this.start();
      }
      throw err;
    }

    // Inject preset rules as history context (skip on resume — rules were already injected)
    if (this.options.presetRules && !this.options.resume) {
      this.sendCommand({
        type: 'init_history',
        text: `[Assistant System Rules]\n${this.options.presetRules}`,
      });
    }
  }

  private clearResponseStallTimer(): void {
    if (this.responseStallTimer) {
      clearTimeout(this.responseStallTimer);
      this.responseStallTimer = null;
    }
  }

  /**
   * If the aionrs binary emits nothing for too long after a user send, unblock the UI
   * (otherwise the renderer stays on "processing" forever).
   */
  private slideResponseStallWatchdog(msgId: string, stallMs: number = AionrsAgent.RESPONSE_STALL_MS): void {
    this.clearResponseStallTimer();
    if (!msgId) return;
    this.responseStallTimer = setTimeout(() => {
      this.responseStallTimer = null;
      const id = this.activeMsgId || this.pendingTurnMsgId || msgId;
      const minutes = Math.round(stallMs / 60_000);
      this.onStreamEvent({
        type: 'error',
        data:
          stallMs >= AionrsAgent.STALL_DURING_TOOL_MS
            ? `[aionrs] 已超过 ${minutes} 分钟未收到工具执行事件。若正在执行大目录扫描等耗时命令，请缩小路径范围后重试。`
            : `[aionrs] ${Math.round(stallMs / 1000)} 秒内未收到模型响应，连接可能已断开。常见原因：上下文超限、API Key 失效、网络或代理异常、上游服务不可用。请检查配置后重试。`,
        msg_id: id,
      });
      this.onStreamEvent({ type: 'finish', data: '', msg_id: id });
      this.activeMsgId = null;
      this.pendingTurnMsgId = null;
    }, stallMs);
  }

  private handleEvent(event: AionrsEvent): void {
    switch (event.type) {
      case 'ready':
        this.ready = true;
        this.sessionId = event.session_id;
        if (event.session_id) {
          this.onStreamEvent({
            type: 'aionrs_session_bound',
            data: event.session_id,
            msg_id: '',
          });
        }
        this.readyResolve();
        break;

      case 'stream_start':
        this.activeMsgId = event.msg_id;
        this.slideResponseStallWatchdog(event.msg_id);
        this.onStreamEvent({ type: 'start', data: '', msg_id: event.msg_id });
        break;

      case 'text_delta':
        this.slideResponseStallWatchdog(event.msg_id);
        this.onStreamEvent({ type: 'content', data: event.text, msg_id: event.msg_id });
        break;

      case 'thinking':
        this.slideResponseStallWatchdog(event.msg_id);
        this.onStreamEvent({ type: 'thought', data: event.text, msg_id: event.msg_id });
        break;

      case 'tool_request':
        this.slideResponseStallWatchdog(event.msg_id, AionrsAgent.STALL_DURING_TOOL_MS);
        this.onStreamEvent({
          type: 'tool_group',
          data: [
            {
              callId: event.call_id,
              name: event.tool.name,
              description: event.tool.description,
              status: 'Confirming',
              renderOutputAsMarkdown: false,
              confirmationDetails: this.mapConfirmationDetails(event),
            },
          ],
          msg_id: event.msg_id,
        });
        break;

      case 'tool_running':
        this.slideResponseStallWatchdog(event.msg_id, AionrsAgent.STALL_DURING_TOOL_MS);
        this.onStreamEvent({
          type: 'tool_group',
          data: [
            {
              callId: event.call_id,
              name: event.tool_name,
              description: '',
              status: 'Executing',
              renderOutputAsMarkdown: false,
            },
          ],
          msg_id: event.msg_id,
        });
        break;

      case 'tool_result':
        this.slideResponseStallWatchdog(event.msg_id, AionrsAgent.STALL_AFTER_TOOL_RESULT_MS);
        this.onStreamEvent({
          type: 'tool_group',
          data: [
            {
              callId: event.call_id,
              name: event.tool_name,
              description: '',
              status: event.status === 'success' ? 'Success' : 'Error',
              resultDisplay:
                event.output_type === 'diff'
                  ? { fileDiff: event.output, fileName: (event.metadata as Record<string, string>)?.file_path ?? '' }
                  : event.output,
              renderOutputAsMarkdown: event.output_type === 'text',
            },
          ],
          msg_id: event.msg_id,
        });
        break;

      case 'tool_cancelled':
        this.slideResponseStallWatchdog(event.msg_id);
        this.onStreamEvent({
          type: 'tool_group',
          data: [
            {
              callId: event.call_id,
              name: '',
              description: event.reason,
              status: 'Canceled',
              renderOutputAsMarkdown: false,
            },
          ],
          msg_id: event.msg_id,
        });
        break;

      case 'stream_end':
        this.clearResponseStallTimer();
        this.onStreamEvent({ type: 'finish', data: event.usage ?? '', msg_id: event.msg_id });
        this.activeMsgId = null;
        this.pendingTurnMsgId = null;
        break;

      case 'error':
        this.clearResponseStallTimer();
        this.onStreamEvent({
          type: 'error',
          data: event.error.message,
          msg_id: event.msg_id ?? this.activeMsgId ?? '',
        });
        // Some upstream failures only emit `error` without `stream_end`.
        // Emit a best-effort `finish` to unblock the renderer sendbox state machine.
        if (event.msg_id || this.activeMsgId) {
          const msgId = event.msg_id ?? this.activeMsgId ?? '';
          if (msgId) {
            this.onStreamEvent({ type: 'finish', data: '', msg_id: msgId });
          }
        }
        this.activeMsgId = null;
        break;

      case 'info':
        this.slideResponseStallWatchdog(event.msg_id);
        this.onStreamEvent({
          type: 'info',
          data: event.message,
          msg_id: event.msg_id,
        });
        break;
    }
  }

  /**
   * Map aionrs tool_request to 1ONE ClaudeCode confirmation details format.
   */
  private mapConfirmationDetails(event: AionrsEvent & { type: 'tool_request' }) {
    const { tool } = event;

    switch (tool.category) {
      case 'edit':
        return {
          type: 'edit' as const,
          title: tool.description,
          fileName: (tool.args as Record<string, string>).file_path ?? '',
          fileDiff: '',
        };
      case 'exec':
        return {
          type: 'exec' as const,
          title: tool.description,
          rootCommand: (tool.args as Record<string, string>).command?.split(' ')[0] ?? tool.name,
          command: (tool.args as Record<string, string>).command ?? JSON.stringify(tool.args),
        };
      case 'mcp':
        return {
          type: 'mcp' as const,
          title: tool.description,
          toolName: tool.name,
          toolDisplayName: tool.name,
          serverName: '',
        };
      case 'info':
      default:
        return {
          type: 'info' as const,
          title: tool.description,
          prompt: JSON.stringify(tool.args, null, 2),
        };
    }
  }

  sendCommand(cmd: AionrsCommand): void {
    if (!this.childProcess?.stdin?.writable) return;
    this.childProcess.stdin.write(JSON.stringify(cmd) + '\n');
  }

  async send(input: string, msgId: string, files?: string[]): Promise<void> {
    await this.readyPromise;
    this.pendingTurnMsgId = msgId;
    this.slideResponseStallWatchdog(msgId);
    this.sendCommand({
      type: 'message',
      msg_id: msgId,
      input,
      files,
    });
  }

  injectConversationHistory(text: string): Promise<void> {
    this.sendCommand({ type: 'init_history', text });
    return Promise.resolve();
  }

  stop(): void {
    this.clearResponseStallTimer();
    this.pendingTurnMsgId = null;
    this.sendCommand({ type: 'stop' });
  }

  approveTool(callId: string, scope: 'once' | 'always' = 'once'): void {
    this.sendCommand({ type: 'tool_approve', call_id: callId, scope });
  }

  denyTool(callId: string, reason = ''): void {
    this.sendCommand({ type: 'tool_deny', call_id: callId, reason });
  }

  kill(): void {
    this.clearResponseStallTimer();
    this.pendingTurnMsgId = null;
    this.restoreProjectConfig();
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }
  }

  /**
   * Write a temporary .aionrs.toml in the workspace for provider compat overrides.
   * Backs up existing file content so it can be restored on exit.
   */
  private writeProjectConfig(content: string): void {
    const configPath = join(this.options.workspace, AIONRS_PROJECT_CONFIG);
    const existing = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null;
    this.configBackup = { path: configPath, content: existing };

    // If a project config already exists, only append lines that are not yet present.
    // This prevents duplicate TOML sections when restore failed on a previous run.
    if (existing) {
      const missingLines = content.split('\n').filter((line) => line.trim() && !existing.includes(line.trim()));
      if (missingLines.length > 0) {
        writeFileSync(configPath, `${existing}\n${missingLines.join('\n')}\n`, 'utf-8');
      }
    } else {
      writeFileSync(configPath, content, 'utf-8');
    }
  }

  /**
   * Restore or remove the .aionrs.toml written by writeProjectConfig.
   * Also cleans up any `aionrs_ONE_*.toml` session files left behind by the binary.
   */
  private restoreProjectConfig(): void {
    if (!this.configBackup) return;
    const { path, content } = this.configBackup;
    this.configBackup = null;

    try {
      if (content === null) {
        unlinkSync(path);
      } else {
        writeFileSync(path, content, 'utf-8');
      }
    } catch {
      // Best-effort cleanup; file may already be removed
    }

    // Clean up `aionrs_ONE_*.toml` session state files the binary writes to the workspace.
    try {
      const dir = join(path, '..');
      const stale = readdirSync(dir).filter((f) => /^aionrs_ONE_.*\.toml$/.test(f));
      for (const f of stale) {
        try { unlinkSync(join(dir, f)); } catch { /* ignore */ }
      }
    } catch {
      // Workspace may not be accessible; skip
    }
  }
}
