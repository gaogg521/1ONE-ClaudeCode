/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { TProviderWithModel } from '@/common/config/storage';
import { resolveAionrsBinary } from './binaryResolver';
import { buildSpawnConfig } from './envBuilder';
import type { AionrsEvent, AionrsCommand } from './protocol';
import { getEnhancedEnv, withNpxCommandOnPath } from '@process/utils/shellEnv';
import { resolveOfficecliDir } from '@process/utils/officecliResolver';

const AIONRS_PROJECT_CONFIG = '.aionrs.toml';

type StreamEventHandler = (event: { type: string; data: unknown; msg_id: string }) => void;

type AionrsToolResultEvent = Extract<AionrsEvent, { type: 'tool_result' }>;

const IMAGE_FILE_REGEX =
  /([A-Za-z]:[^\s"'`]+?\.(?:png|jpe?g|gif|webp|bmp|svg)|(?:^|[\s:(])([^\s"'`]*img-\d+\.(?:png|jpe?g|gif|webp|bmp|svg)))/i;

const tryParseJsonRecord = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export function mapAionrsToolResultDisplay(event: AionrsToolResultEvent): unknown {
  const metadata = (event.metadata as Record<string, unknown> | undefined) ?? {};

  if (event.output_type === 'diff') {
    return {
      fileDiff: event.output,
      fileName: typeof metadata.file_path === 'string' ? metadata.file_path : '',
    };
  }

  if (event.output_type !== 'image') {
    return event.output;
  }

  const parsedOutput = tryParseJsonRecord(event.output);
  const outputRecord = parsedOutput ?? {};
  const candidateImgUrl =
    [
      outputRecord.img_url,
      outputRecord.image_url,
      metadata.img_url,
      metadata.image_url,
      metadata.file_path,
      metadata.path,
      metadata.uri,
    ].find((value) => typeof value === 'string' && value.trim().length > 0) ?? null;
  const candidateRelativePath =
    [outputRecord.relative_path, metadata.relative_path, metadata.relativePath].find(
      (value) => typeof value === 'string' && value.trim().length > 0
    ) ?? null;

  if (typeof candidateImgUrl === 'string') {
    return {
      img_url: candidateImgUrl,
      relative_path: typeof candidateRelativePath === 'string' ? candidateRelativePath : undefined,
    };
  }

  const markdownMatch = event.output.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (markdownMatch?.[1]) {
    return {
      img_url: markdownMatch[1],
      relative_path: typeof candidateRelativePath === 'string' ? candidateRelativePath : undefined,
    };
  }

  const pathMatch = event.output.match(IMAGE_FILE_REGEX);
  const extractedPath = pathMatch?.[1] || pathMatch?.[2];
  if (extractedPath) {
    const normalizedPath = extractedPath.trim();
    return {
      img_url: normalizedPath,
      relative_path: typeof candidateRelativePath === 'string' ? candidateRelativePath : normalizedPath,
    };
  }

  return event.output;
}

export type AionrsAgentOptions = {
  workspace: string;
  model: TProviderWithModel;
  /** 1ONE conversation id — used when resume fails to start a fresh aionrs session with a stable key. */
  conversation_id?: string;
  /** App-managed directory for diagnostic logs (kept out of the user's workspace). */
  logDir?: string;
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
  /** Set when the host intentionally kills the binary (model switch, idle, shutdown).
   *  Suppresses the "unexpected exit" error in the exit handler for signal-kills. */
  private killed = false;
  /** Resolved diagnostic-log directory (app cache dir, not the user's workspace). */
  private logBase: string = '';

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

    // Keep diagnostic logs out of the user's workspace (avoids git pollution / unbounded
    // growth in their project). Fall back to workspace only if no app cache dir was provided.
    const logBase = this.options.logDir || this.options.workspace;
    this.logBase = logBase;
    try {
      mkdirSync(logBase, { recursive: true });
    } catch {
      // best-effort; writes below are guarded individually
    }

    const { args, env, projectConfig } = buildSpawnConfig(this.options.model, {
      workspace: this.options.workspace,
      logDir: logBase,
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
    let childEnv = withNpxCommandOnPath(getEnhancedEnv());
    // Inject bundled officecli directory into PATH so the agent's bash tool
    // can invoke `officecli` commands without requiring a system-wide install.
    const officecliDir = resolveOfficecliDir();
    if (officecliDir) {
      const sep = process.platform === 'win32' ? ';' : ':';
      childEnv = { ...childEnv, PATH: `${officecliDir}${sep}${childEnv.PATH || ''}` };
    }
    // Diagnostic dump of the exact spawn shape — args + project config — so any future
    // 90 s stall report can be matched to the binary's actual input without re-asking.
    // Worker stdout is dropped by Electron utilityProcess.fork default; write to a known file.
    try {
      const dumpPath = join(logBase, '.aionrs-spawn.log');
      const stamp = new Date().toISOString();
      const stack = new Error('spawn caller').stack ?? '(no stack)';
      writeFileSync(
        dumpPath,
        `[${stamp}] binary=${binaryPath}\nargs=${JSON.stringify(args)}\nprojectConfig:\n${projectConfig || '(none)'}\nstack:\n${stack}\n\n`,
        { flag: 'a' }
      );
    } catch (e) {
      console.error('[AionrsAgent] failed to write spawn dump:', e);
    }
    console.info('[AionrsAgent] spawn', { binaryPath, args, projectConfig: projectConfig || '(none)' });
    this.childProcess = spawn(binaryPath, args, {
      env: { ...childEnv, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.options.workspace,
    });

    // Parse stdout JSON Lines, mirror to <workspace>/.aionrs-stdout.log for diagnostics
    // (Electron utilityProcess drops worker stdout/stderr so console.error isn't visible).
    const stdoutPath = join(logBase, '.aionrs-stdout.log');
    // Truncate per worker session so the mirror cannot grow without bound across turns.
    try {
      writeFileSync(stdoutPath, '', { flag: 'w' });
    } catch {
      // best-effort
    }
    const rl = createInterface({ input: this.childProcess.stdout! });
    rl.on('line', (line) => {
      try {
        writeFileSync(stdoutPath, line + '\n', { flag: 'a' });
      } catch {
        // best-effort
      }
      try {
        const event = JSON.parse(line) as AionrsEvent;
        this.handleEvent(event);
      } catch {
        console.error('[AionrsAgent] Failed to parse event:', line);
      }
    });

    // Log stderr as diagnostics — also mirror to <workspace>/.aionrs-stderr.log
    // because Electron utilityProcess drops worker stdout/stderr by default.
    const stderrPath = join(logBase, '.aionrs-stderr.log');
    try {
      writeFileSync(stderrPath, '', { flag: 'w' });
    } catch {
      // best-effort
    }
    this.childProcess.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      console.error('[aionrs]', text);
      try {
        writeFileSync(stderrPath, text, { flag: 'a' });
      } catch {
        // best-effort
      }
    });

    // Handle process exit
    this.childProcess.on('exit', (code) => {
      this.clearResponseStallTimer();
      this.restoreProjectConfig();

      if (this.killed) {
        // Host-initiated kill (model switch / idle / shutdown). The manager already
        // emitted a synthetic finish to unlock the UI — do not surface a scary
        // "unexpected exit" error for the SIGTERM we sent ourselves.
        this.activeMsgId = null;
        this.pendingTurnMsgId = null;
        this.childProcess = null;
        return;
      }

      if (!this.ready) {
        // Exited before emitting ready — reject the bootstrap promise
        this.readyReject(new Error(`aionrs exited with code ${code} during init`));
      } else {
        // Exit code 0 = clean exit. If the turn already finished (stream_end
        // cleared activeMsgId), this is just the binary shutting down after
        // completing its work — not an error. Only surface an error if the
        // process died mid-turn (activeMsgId still set) with a non-zero code.
        const msgId = this.activeMsgId || this.pendingTurnMsgId || '';
        if (msgId && code !== 0) {
          this.onStreamEvent({
            type: 'error',
            data: `[aionrs] 进程意外退出（exit code ${code}）。可能原因：上下文超过模型限制、API 认证失败或上游服务异常。请重试或检查模型配置。`,
            msg_id: msgId,
          });
          this.onStreamEvent({ type: 'finish', data: '', msg_id: msgId });
        }
        // For exit code 0 mid-turn: the binary finished cleanly. If content
        // was already streamed, treat as normal completion (emit finish to
        // unblock the UI spinner without a scary error message).
        if (msgId && code === 0) {
          this.onStreamEvent({ type: 'finish', data: '', msg_id: msgId });
        }
        this.activeMsgId = null;
        this.pendingTurnMsgId = null;
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
              resultDisplay: mapAionrsToolResultDisplay(event),
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

      default: {
        // aionrs 0.1.30 added new events (config_changed, mcp_ready, pong) that
        // older clients don't handle. Log unknowns to a diagnostic file so we can
        // see what the binary emits without polluting the renderer.
        try {
          const dumpPath = join(this.logBase || this.options.workspace, '.aionrs-unknown-events.log');
          writeFileSync(dumpPath, `[${new Date().toISOString()}] ${JSON.stringify(event)}\n`, { flag: 'a' });
        } catch {
          // best-effort
        }
        break;
      }
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
    // aionrs 0.1.30 protocol expects `content` (was `input` in 0.1.7 — silent
    // rename caused every send to be rejected with "missing field content").
    this.sendCommand({
      type: 'message',
      msg_id: msgId,
      content: input,
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
    this.killed = true;
    this.clearResponseStallTimer();
    this.pendingTurnMsgId = null;
    this.activeMsgId = null;
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
        try {
          unlinkSync(join(dir, f));
        } catch {
          /* ignore */
        }
      }
    } catch {
      // Workspace may not be accessible; skip
    }
  }
}
