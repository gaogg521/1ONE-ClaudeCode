/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConfirmation, IMessageToolGroup, TMessage, IMessageText } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import { BaseApprovalStore, type IApprovalKey } from '@/common/chat/approval';
import { ToolConfirmationOutcome } from '../agent/gemini/cli/tools/tools';
import { getDatabase } from '@process/services/database';
import { addMessage, addOrUpdateMessage } from '@process/utils/message';
import { uuid } from '@/common/utils';
import BaseAgentManager from './BaseAgentManager';
import { IpcAgentEventEmitter } from './IpcAgentEventEmitter';
import { mainError } from '@process/utils/mainLogger';
import { emitAionrsTurnCompleted } from '@process/utils/emitConversationTurnCompleted';
import { ProcessConfig } from '@process/utils/initStorage';
import type { IProvider } from '@/common/config/storage';
import { getSystemDir } from '@process/utils/initStorage';
import fs from 'node:fs';
import path from 'node:path';

// Aionrs-specific approval key — reuses same pattern as GeminiApprovalStore
type AionrsApprovalKey = IApprovalKey & {
  action: 'exec' | 'edit' | 'info' | 'mcp';
  identifier?: string;
};

function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name);
}

type ToolGroupItem = {
  name?: string;
  status?: string;
  description?: string;
  callId?: string;
  // resultDisplay can be string or { fileDiff, fileName } etc.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resultDisplay?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  confirmationDetails?: any;
  renderOutputAsMarkdown?: boolean;
};

export class AionrsApprovalStore extends BaseApprovalStore<AionrsApprovalKey> {
  static createKeysFromConfirmation(action: string, commandType?: string): AionrsApprovalKey[] {
    if (action === 'exec' && commandType) {
      return commandType
        .split(',')
        .map((cmd) => cmd.trim())
        .filter(Boolean)
        .filter(isValidCommandName)
        .map((cmd) => ({ action: 'exec' as const, identifier: cmd }));
    }
    if (action === 'edit' || action === 'info' || action === 'mcp') {
      return [{ action: action as AionrsApprovalKey['action'] }];
    }
    return [];
  }
}

type AionrsManagerData = {
  workspace: string;
  proxy?: string;
  model: TProviderWithModel;
  conversation_id: string;
  yoloMode?: boolean;
  presetRules?: string;
  maxTokens?: number;
  maxTurns?: number;
  sessionMode?: string;
  sessionId?: string;
  resume?: string;
  /** App-managed diagnostic-log dir, injected by the manager (kept out of the workspace). */
  logDir?: string;
  /** Enabled skills for this conversation (preset assistant config). Injected into the first message. */
  enabledSkills?: string[];
};

export class AionrsManager extends BaseAgentManager<AionrsManagerData, string> {
  workspace: string;
  model: TProviderWithModel;
  readonly approvalStore = new AionrsApprovalStore();
  private currentMode: string = 'default';
  /** Derived from sessionMode='yolo' or explicit yoloMode — passed to aionrs binary as --auto-approve. */
  private autoApproveEnabled: boolean = false;
  private static readonly autoFixedProtocolKeys = new Set<string>();
  private pendingModelIdentityNotice: string | null = null;
  private lastModelIdSeen: string | null = null;
  private activeTurnId: string | null = null;
  /** Skills content is injected once into the first user turn, then cleared. */
  private pendingSkillsInjection: string | null = null;
  /** Whether skills have already been injected into a prior turn. Prevents re-injection
   *  when loadSkillsInjection runs late or enabledSkills arrives via finalizeFromPrewarm. */
  private skillsAlreadyInjected = false;

  private inferProductLine(): string {
    const modelId = (this.model.useModel || '').toLowerCase();
    const platform = (this.model.platform || '').toLowerCase();
    const provider = (this.model.name || '').toLowerCase();

    if (modelId.includes('qwen') || provider.includes('qwen') || platform.includes('dashscope')) return 'Qwen';
    if (modelId.includes('gemini') || provider.includes('gemini') || platform.includes('gemini')) return 'Gemini';
    if (modelId.includes('claude') || provider.includes('anthropic') || platform.includes('anthropic')) return 'Claude';
    if (modelId.includes('deepseek') || provider.includes('deepseek')) return 'DeepSeek';
    if (modelId.includes('kimi') || provider.includes('moonshot') || provider.includes('kimi')) return 'Kimi';
    if (modelId.includes('doubao') || provider.includes('doubao') || provider.includes('volc')) return 'Doubao';
    if (modelId.includes('gpt') || modelId.includes('o1') || modelId.includes('o3') || provider.includes('openai'))
      return 'OpenAI';
    if (provider) return this.model.name;
    return 'Model';
  }

  private isModelIdentityQuery(input: string): boolean {
    const s = (input || '').trim().toLowerCase();
    if (!s) return false;
    // Chinese + English common patterns
    if (/(你|您).*(什么|哪个).*(模型|model)/.test(s)) return true;
    if (/(用的|正在用).*(哪个|什么).*(模型|model)/.test(s)) return true;
    if (/which\s+model|what\s+model|model\s+are\s+you/.test(s)) return true;
    return false;
  }

  constructor(data: AionrsManagerData, model: TProviderWithModel) {
    // Route aionrs diagnostic logs to an app cache dir instead of the user's workspace.
    const logDir = path.join(getSystemDir().cacheDir, 'aionrs-logs', data.conversation_id);
    super('aionrs', { ...data, model, logDir }, new IpcAgentEventEmitter());
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.currentMode = data.sessionMode || 'default';
    // sessionMode='yolo' must propagate to yoloMode so the aionrs binary gets
    // --auto-approve. Without this, the binary prompts for tool confirmation
    // even when the user selected full-auto mode at conversation creation.
    this.autoApproveEnabled = this.currentMode === 'yolo' || data.yoloMode === true;

    // Start the worker bootstrap
    void this.start().catch(() => {});

    // Pre-load enabled skills content so the first user turn can inject it.
    // aionrs has no native SkillManager and no activate_skill tool — without this
    // injection, skills configured for an aionrs assistant never reach the model.
    const enabledSkills = data.enabledSkills;
    if (enabledSkills && enabledSkills.length > 0) {
      void this.loadSkillsInjection(enabledSkills);
    }
  }

  private async loadSkillsInjection(enabledSkills: string[]): Promise<void> {
    try {
      const { loadSkillsContent } = await import('@process/utils/initStorage');
      const content = await loadSkillsContent(enabledSkills);
      if (content) {
        this.pendingSkillsInjection = content;
      }
    } catch (e) {
      // Main-process console.* triggers bridge.adapter.emit (frozen event loop on repeated calls). Write to file.
      try {
        const { appendFileSync, mkdirSync } = require('node:fs');
        const { join } = require('node:path');
        const { getPlatformServices } = require('@/common/platform');
        const logsDir = getPlatformServices().paths.getLogsDir();
        try { mkdirSync(logsDir, { recursive: true }); } catch {}
        appendFileSync(join(logsDir, 'aionrs-manager.log'),
          `[${new Date().toISOString()}] Failed to load skills content: ${e instanceof Error ? e.message : String(e)}\n`, 'utf-8');
      } catch {
        // best-effort
      }
    }
  }

  /**
   * Start the worker with correct aionrs session keys.
   *
   * aionrs `--resume` must receive the **binary's** `session_id` from a prior `ready` event
   * (short id like `16a3dd1a`), not 1ONE's `conversation_id` UUID — the latter causes
   * "Session not found", exit code 1 during init, and a slow double-start fallback.
   * We persist `extra.aionrsSessionId` when `ready` fires; only then use `--resume`.
   */
  override async start() {
    try {
      const db = await getDatabase();
      const result = db.getConversationMessages(this.conversation_id, 0, 1);
      const hasMessages = (result.data?.length ?? 0) > 0;

      const conv = db.getConversation(this.conversation_id);
      let storedAionrsSession: string | undefined;
      let storedLastModelId = '';
      if (conv.success && conv.data?.extra) {
        const extra = conv.data.extra as Record<string, unknown>;
        const raw = extra.aionrsSessionId;
        if (typeof raw === 'string' && raw.trim()) storedAionrsSession = raw.trim();
        storedLastModelId = String(extra.lastModelId ?? '');
      }

      // A persisted aionrs session is bound to the model that created it. If the user
      // switched models (lastModelId differs from the current model), resuming that
      // session points the binary at the new endpoint/key with stale session state —
      // the model never responds and the host fires the 90 s stall watchdog. Start a
      // fresh session instead; injectHistoryFromDatabase() below re-seeds the context.
      const currentModelId = this.model.useModel || '';
      const modelUnchanged = !storedLastModelId || storedLastModelId === currentModelId;
      const sessionArgs =
        hasMessages && storedAionrsSession && modelUnchanged
          ? { resume: storedAionrsSession }
          : { sessionId: this.conversation_id };

      const res = await super.start({
        ...this.data.data,
        ...sessionArgs,
        yoloMode: this.autoApproveEnabled,
      } as AionrsManagerData);

      // When the worker is rebuilt (commonly after model switch), it starts fresh and loses "self identity".
      // Inject a one-time reminder into the next user message so the model can correctly answer
      // "which model are you using?" without changing any request behavior.
      try {
        const conv = db.getConversation(this.conversation_id);
        const lastModelId = String(
          (conv as { data?: { extra?: Record<string, unknown> } })?.data?.extra?.lastModelId ?? ''
        );
        this.lastModelIdSeen = lastModelId || (hasMessages ? currentModelId : null);
        if (hasMessages && currentModelId && lastModelId && lastModelId !== currentModelId) {
          this.pendingModelIdentityNotice = currentModelId;
        } else if (hasMessages && currentModelId && !lastModelId) {
          // If we don't have a persisted lastModelId yet, still set the reminder once for resumed sessions.
          this.pendingModelIdentityNotice = currentModelId;
        }
        if (currentModelId) {
          // Persist lastModelId for future comparisons (best-effort, do not block startup)
          if ((conv as { success?: boolean })?.success && (conv as { data?: any })?.data) {
            const conversation = (conv as { data: any }).data;
            db.updateConversation(this.conversation_id, {
              extra: { ...conversation.extra, lastModelId: currentModelId },
            } as Partial<typeof conversation>);
          }
        }
      } catch {
        // ignore
      }

      // Critical: when the task is rebuilt (e.g. model switch), the aionrs process starts fresh.
      // Inject recent conversation history from DB so the new model keeps context.
      // Best-effort: failures should not block startup.
      await this.injectHistoryFromDatabase().catch(() => {});
      return res;
    } catch {
      // Fallback: start as new session if DB check fails
      const res = await super.start({
        ...this.data.data,
        sessionId: this.conversation_id,
        yoloMode: this.autoApproveEnabled,
      } as AionrsManagerData);
      await this.injectHistoryFromDatabase().catch(() => {});
      return res;
    }
  }

  private async injectHistoryFromDatabase(): Promise<void> {
    try {
      const result = (await getDatabase()).getConversationMessages(this.conversation_id, 0, 20000);
      const data = (result.data || []) as TMessage[];

      // Rebuild a "best-effort full" transcript of the conversation so that switching models
      // does not lose context. Include tool calls/results and error/info messages, not only text.
      // Hard limits prevent blowing up prompt size.
      const MAX_ITEMS = 200;
      const MAX_CHARS = 20000;

      const pushLine = (acc: string[], line: string) => {
        if (!line) return;
        acc.push(line);
      };

      const formatToolGroup = (m: IMessageToolGroup): string[] => {
        const items = (m.content || []) as ToolGroupItem[];
        const out: string[] = [];
        for (const it of items) {
          const status = it.status ? String(it.status) : 'Unknown';
          const name = it.name ? String(it.name) : 'tool';
          const desc = it.description ? String(it.description) : '';
          pushLine(out, `Tool[${status}]: ${name}${desc ? ` — ${desc}` : ''}`);

          const rd = it.resultDisplay;
          if (typeof rd === 'string' && rd.trim()) {
            const clipped = rd.length > 1200 ? rd.slice(0, 1200) + '\n...(truncated)...' : rd;
            pushLine(out, clipped);
          } else if (rd && typeof rd === 'object') {
            // Common shape: { fileDiff, fileName }
            const fileName = typeof rd.fileName === 'string' ? rd.fileName : '';
            const fileDiff = typeof rd.fileDiff === 'string' ? rd.fileDiff : '';
            if (fileName) pushLine(out, `File: ${fileName}`);
            if (fileDiff) {
              const clipped = fileDiff.length > 1200 ? fileDiff.slice(0, 1200) + '\n...(truncated)...' : fileDiff;
              pushLine(out, clipped);
            }
          }
        }
        return out;
      };

      const tail = data.slice(-MAX_ITEMS);
      const lines: string[] = [];
      for (const m of tail) {
        if (m.type === 'text') {
          const mm = m as IMessageText;
          const role = mm.position === 'right' ? 'User' : 'Assistant';
          const content = (mm.content?.content || '').trim();
          if (content) pushLine(lines, `${role}: ${content}`);
          continue;
        }

        if (m.type === 'tool_group') {
          const mm = m as unknown as IMessageToolGroup;
          const role = mm.position === 'right' ? 'User' : 'Assistant';
          pushLine(lines, `${role}: (tool_calls)`);
          for (const l of formatToolGroup(mm)) pushLine(lines, l);
          continue;
        }

        // Persisted error/info messages are useful for continuity (auth errors, limits, etc.)
        const mt = (m as { type?: unknown }).type;
        if (mt === 'error' || mt === 'info') {
          const role = (m as { position?: string }).position === 'right' ? 'User' : 'Assistant';
          const content = String((m as { data?: unknown; content?: unknown }).data ?? '');
          if (content.trim()) pushLine(lines, `${role}: (${mt}) ${content}`);
          continue;
        }
      }

      const fullText = lines.join('\n');

      // If history is too large, persist a snapshot BEFORE truncation.
      // This ensures we "save memory before it blows up", as requested.
      let snapshotPath: string | null = null;
      if (fullText.length > MAX_CHARS) {
        try {
          const { cacheDir } = getSystemDir();
          const dir = path.join(cacheDir, 'history-snapshots', 'aionrs');
          fs.mkdirSync(dir, { recursive: true });
          const fileName = `${this.conversation_id}-${Date.now()}.md`;
          snapshotPath = path.join(dir, fileName);
          fs.writeFileSync(snapshotPath, fullText, 'utf-8');
        } catch {
          snapshotPath = null;
        }
      }

      const truncatedTail = fullText.slice(-MAX_CHARS);
      const headerLines: string[] = [];
      headerLines.push('[Conversation History]');
      headerLines.push(`Note: history may be truncated for context limits. ConversationId=${this.conversation_id}.`);
      if (snapshotPath) {
        headerLines.push(`Full history snapshot saved at: ${snapshotPath}`);
        headerLines.push('You may read it if you need older context.');
      }
      headerLines.push('');

      const text = `${headerLines.join('\n')}${fullText.length > MAX_CHARS ? '...(history truncated)...\n' : ''}${truncatedTail}`;
      if (text) {
        await this.postMessagePromise('init.history', { text });
      }
    } catch {
      // ignore history injection errors
    }
  }

  async stop() {
    // Inject history BEFORE stopping so the command reaches the running process.
    // Skip if already finished — the worker subprocess may no longer be alive.
    if (this.status !== 'finished') {
      await this.injectHistoryFromDatabase();
    }
    await super.stop();
    this.status = 'finished';
    emitAionrsTurnCompleted(this, this.activeTurnId ?? this.conversation_id, 'stopped');
  }

  /**
   * When the worker process is killed mid-turn (model switch, idle timeout, app
   * shutdown), the aionrs binary inside the worker dies before it can emit
   * `stream_end`/`finish` to the host. Without a synthetic finish, the renderer
   * sendbox stays locked on "正在进行对话中..." forever.
   *
   * Emit the finish + runtime snapshot to the renderer BEFORE delegating to
   * super.kill() so the IPC packet is queued while the manager is still alive.
   */
  protected override emitSyntheticFinishOnKill(): void {
    if (this.status !== 'running' && this.status !== 'pending') return;
    const turnId = this.activeTurnId ?? this.conversation_id;
    this.status = 'finished';
    try {
      ipcBridge.conversation.responseStream.emit({
        type: 'finish',
        data: '',
        msg_id: turnId,
        conversation_id: this.conversation_id,
      } as IResponseMessage);
    } catch {
      // best-effort
    }
    emitAionrsTurnCompleted(this, turnId, 'stopped');
  }

  async sendMessage(data: { input: string; agentPrompt?: string; msg_id: string; files?: string[] }) {
    const originalInput = data.input;

    // One-shot skills injection: aionrs has no native skill discovery, so we splice
    // the full SKILL.md content into the first user turn. Must land on BOTH input
    // and agentPrompt — the worker sends `agentPrompt ?? input`, so writing only
    // input gets dropped whenever an agentPrompt is present (the normal case).
    //
    // Prewarm race: the prewarm pool creates the AionrsManager from a placeholder
    // conversation whose extra does NOT carry enabledSkills — they arrive later via
    // finalizeFromPrewarm. The manager's `data` is a constructor snapshot and is NOT
    // refreshed when the DB row is finalized, so read enabledSkills fresh from the DB
    // on the first turn instead of trusting this.data.enabledSkills.
    if (!this.skillsAlreadyInjected && this.pendingSkillsInjection === null) {
      try {
        const db = await getDatabase();
        const conv = db.getConversation(this.conversation_id);
        const extra = (conv as { data?: { extra?: Record<string, unknown> } })?.data?.extra;
        const liveSkills = Array.isArray(extra?.enabledSkills) ? (extra!.enabledSkills as string[]) : undefined;
        const skills = liveSkills ?? this.data.data.enabledSkills;
        if (skills && skills.length > 0) {
          await this.loadSkillsInjection(skills);
        }
      } catch {
        // best-effort — fall through, no injection this turn
      }
    }
    if (this.pendingSkillsInjection) {
      const skillsBlock = `[Pre-loaded Skills - You MUST follow these instructions]\n${this.pendingSkillsInjection}\n\n[User Request]\n`;
      const base = data.agentPrompt ?? (data.input || '');
      data = { ...data, input: skillsBlock + base, agentPrompt: skillsBlock + base };
      this.pendingSkillsInjection = null;
      this.skillsAlreadyInjected = true;
    }

    // Detect model switches even when the worker is NOT rebuilt (some flows can update model routing without restart).
    // If we notice a change, queue a one-time identity reminder for the next prompt.
    try {
      const currentModelId = this.model.useModel || '';
      if (currentModelId && this.lastModelIdSeen && this.lastModelIdSeen !== currentModelId) {
        this.pendingModelIdentityNotice = currentModelId;
      }
      if (currentModelId && (!this.lastModelIdSeen || this.lastModelIdSeen !== currentModelId)) {
        this.lastModelIdSeen = currentModelId;
        // Best-effort persist; do not block send.
        const db = await getDatabase();
        const conv = db.getConversation(this.conversation_id);
        if ((conv as { success?: boolean })?.success && (conv as { data?: any })?.data) {
          const conversation = (conv as { data: any }).data;
          db.updateConversation(this.conversation_id, {
            extra: { ...conversation.extra, lastModelId: currentModelId },
          } as Partial<typeof conversation>);
        }
      }
    } catch {
      // ignore
    }

    const identityQuery = this.isModelIdentityQuery(originalInput);

    // Deterministic behavior: if the user is explicitly asking "which model are you using",
    // always inject a short reminder for THIS turn (no need to rely on model switch detection).
    if (identityQuery) {
      const modelId = this.model.useModel || '';
      const productLine = this.inferProductLine();
      const notice =
        `<system-reminder>\n` +
        `You are currently running with model id "${modelId}".\n` +
        `When the user asks which model you are using, answer in Chinese in this exact format: "${productLine} / ${modelId}".\n` +
        `Do not answer with only a product family name; always include the exact model id.\n` +
        `</system-reminder>\n\n`;
      // The worker sends `agentPrompt ?? input`, so the notice must land on BOTH
      // fields — injecting into `input` alone gets silently dropped when an
      // agentPrompt (augmentation/skill prefix) is present, which is the norm.
      {
        const base = data.agentPrompt ?? (data.input || '');
        data = { ...data, input: notice + base, agentPrompt: notice + base };
      }
      // Identity-question path already carries the needed instruction; avoid stacking a second reminder.
      this.pendingModelIdentityNotice = null;
    } else if (this.pendingModelIdentityNotice) {
      // Inject a one-time model identity reminder after model switches/rebuilds.
      // Keep it extremely short and self-contained to avoid affecting normal behavior.
      const modelId = this.pendingModelIdentityNotice;
      const platform = this.model.platform || '';
      const provider = this.model.name || '';
      const productLine = this.inferProductLine();
      const notice =
        `<system-reminder>\n` +
        `Model switch: You are now running as ${modelId}. Platform=${platform}. Provider=${provider}.\n` +
        `When asked which model you are using, answer in this format: "<product line> / <exact model id>".\n` +
        `- Product line: use a short vendor/product family name inferred from Provider/Platform/Model (e.g. "Qwen", "Gemini", "OpenAI").\n` +
        `- Exact model id: answer exactly "${modelId}".\n` +
        `Example: "${productLine} / ${modelId}"\n` +
        `</system-reminder>\n\n`;
      {
        const base = data.agentPrompt ?? (data.input || '');
        data = { ...data, input: notice + base, agentPrompt: notice + base };
      }
      this.pendingModelIdentityNotice = null;
    } else if (data.agentPrompt) {
      data = { ...data, input: data.agentPrompt };
    }

    const message: TMessage = {
      id: data.msg_id,
      type: 'text',
      position: 'right',
      conversation_id: this.conversation_id,
      // Never persist injected system reminders into user-visible chat history.
      // Keep DB + UI clean; only the worker sees the injected prefix.
      content: { content: originalInput },
    };
    addMessage(this.conversation_id, message);
    try {
      (await getDatabase()).updateConversation(this.conversation_id, {});
    } catch {
      // Conversation might not exist in DB yet
    }
    this.status = 'pending';
    this.activeTurnId = data.msg_id;
    emitAionrsTurnCompleted(this, data.msg_id, 'ai_generating');

    // aionrs backend does not support image vision — the binary passes file
    // paths as text context and envBuilder tells the agent not to read images.
    // Pre-describe images via the user's configured model's vision API and
    // inject the text description into the prompt, so the agent can "see"
    // image content. Non-image files pass through unchanged.
    //
    // Critical: image file paths must NEVER reach aionrs's files array —
    // envBuilder warns the agent not to read them, and some aionrs binary
    // versions exit(0) silently when handed image paths it can't process.
    // Always strip images from files, even if vision description fails.
    if (data.files && data.files.length > 0) {
      const { describeImagesForPrompt } = await import('@process/services/visionDescribe');
      const { isImageFilePath, isMediaFilePath } = await import('@/common/chat/messageFiles');
      const imageFiles = data.files.filter((f) => isImageFilePath(f));
      // Keep only files aionrs can actually read/edit (text/docs). All binary media
      // (image/audio/video) is stripped: aionrs can't read binaries and some binary
      // versions exit(0) silently on them. Their content still reaches the model —
      // images via the vision description appended below, audio/video via the STT
      // transcript baked into agentPrompt by the attachment-augmentation step.
      const keptFiles = data.files.filter((f) => !isMediaFilePath(f));
      const strippedMedia = data.files.length !== keptFiles.length;

      let imageDescriptionBlock = '';
      if (imageFiles.length > 0) {
        // Prefer the active chat model (Kimi K2.6 / Qwen-VL etc. are natively
        // multimodal). If it can't describe the image (text-only model), fall back
        // to any other vision-capable provider configured in Settings.
        const { resolveFallbackVisionModel } = await import('@process/services/visionModelResolver');
        const fallbackVisionModel = await resolveFallbackVisionModel(this.model).catch(
          (): TProviderWithModel | undefined => undefined
        );
        const primaryHasKey = this.model.apiKey && this.model.useModel;
        if (primaryHasKey || fallbackVisionModel) {
          try {
            const result = await describeImagesForPrompt(
              imageFiles,
              primaryHasKey ? this.model : (fallbackVisionModel as TProviderWithModel),
              primaryHasKey ? fallbackVisionModel : undefined
            );
            imageDescriptionBlock = result.imageDescriptionBlock;
          } catch (error) {
            // Main-process console.* triggers bridge.adapter.emit — write to file instead.
            try {
              const { appendFileSync, mkdirSync } = require('node:fs');
              const { join } = require('node:path');
              const { getPlatformServices } = require('@/common/platform');
              const logsDir = getPlatformServices().paths.getLogsDir();
              try { mkdirSync(logsDir, { recursive: true }); } catch {}
              appendFileSync(join(logsDir, 'aionrs-manager.log'),
                `[${new Date().toISOString()}] Image vision description failed: ${error instanceof Error ? error.message : String(error)}\n`, 'utf-8');
            } catch {
              // best-effort
            }
            imageDescriptionBlock = `\n\n[Images attached but vision description unavailable: ${imageFiles.map((f) => f.replace(/\\/g, '/').split('/').pop()).join(', ')}]\n`;
          }
        } else {
          imageDescriptionBlock =
            `\n\n[Images attached: ${imageFiles.map((f) => f.replace(/\\/g, '/').split('/').pop()).join(', ')}. ` +
            `No vision-capable model is configured. Add a model with vision support (e.g. Kimi K2.6, Qwen-VL, GPT-4o, Gemini) in Settings → Models, or describe the image in your message.]\n`;
        }
      }

      if (strippedMedia || imageDescriptionBlock) {
        // The worker sends `agentPrompt ?? input`, so the vision description must
        // be appended to BOTH fields; appending to `input` alone is silently
        // dropped whenever an agentPrompt is present (the normal case), which is
        // why uploaded images were invisible to the model.
        const promptBase = data.agentPrompt ?? data.input;
        data = {
          ...data,
          input: data.input + imageDescriptionBlock,
          agentPrompt: promptBase + imageDescriptionBlock,
          files: keptFiles,
        };
      }
    }

    return super.sendMessage(data);
  }

  /**
   * Check if a confirmation should be auto-approved based on current mode.
   */
  private tryAutoApprove(content: IMessageToolGroup['content'][number]): boolean {
    const type = content.confirmationDetails?.type;

    if (this.currentMode === 'yolo') {
      void this.postMessagePromise(content.callId, ToolConfirmationOutcome.ProceedOnce);
      return true;
    }
    if (this.currentMode === 'autoEdit') {
      if (type === 'edit' || type === 'info') {
        void this.postMessagePromise(content.callId, ToolConfirmationOutcome.ProceedOnce);
        return true;
      }
    }
    return false;
  }

  private emitRuntimeSnapshot(state?: IConversationTurnCompletedEvent['state']): void {
    const pendingConfirmations = this.getConfirmations().length;
    const resolvedState =
      state ??
      (pendingConfirmations > 0
        ? 'ai_waiting_confirmation'
        : this.status === 'running' || this.status === 'pending'
          ? 'ai_generating'
          : 'ai_waiting_input');
    emitAionrsTurnCompleted(this, this.activeTurnId ?? this.conversation_id, resolvedState);
  }

  protected override addConfirmation(data: IConfirmation<string>): void {
    const pendingBefore = this.getConfirmations().length;
    super.addConfirmation(data);
    if (this.getConfirmations().length > pendingBefore) {
      this.emitRuntimeSnapshot('ai_waiting_confirmation');
    }
  }

  private handleConformationMessage(message: IMessageToolGroup) {
    const confirmingTools = message.content.filter((c) => c.status === 'Confirming');

    for (const content of confirmingTools) {
      // Check mode-based auto-approval
      if (this.tryAutoApprove(content)) continue;

      // Check approval store ("always allow" memory)
      const action = content.confirmationDetails?.type ?? 'info';
      const commandType =
        action === 'exec' ? (content.confirmationDetails as { rootCommand?: string })?.rootCommand : undefined;
      const keys = AionrsApprovalStore.createKeysFromConfirmation(action, commandType);
      if (keys.length > 0 && this.approvalStore.allApproved(keys)) {
        void this.postMessagePromise(content.callId, ToolConfirmationOutcome.ProceedOnce);
        continue;
      }

      // Show confirmation dialog to user
      const options = [
        { label: 'messages.confirmation.yesAllowOnce', value: ToolConfirmationOutcome.ProceedOnce },
        { label: 'messages.confirmation.yesAllowAlways', value: ToolConfirmationOutcome.ProceedAlways },
        { label: 'messages.confirmation.no', value: ToolConfirmationOutcome.Cancel },
      ];

      this.addConfirmation({
        title: content.confirmationDetails?.title || content.name || '',
        id: content.callId,
        action,
        description: content.description || '',
        callId: content.callId,
        options,
        commandType,
      });
    }
  }

  private async persistAionrsSessionId(sessionId: string): Promise<void> {
    const sid = sessionId.trim();
    if (!sid) return;
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (!result.success || !result.data || result.data.type !== 'aionrs') return;
      const conversation = result.data;
      db.updateConversation(this.conversation_id, {
        extra: { ...conversation.extra, aionrsSessionId: sid },
      } as Partial<typeof conversation>);
    } catch (error) {
      mainError('[AionrsManager]', 'Failed to persist aionrs session id', error);
    }
  }

  init() {
    super.init();
    this.on('aionrs.message', (data) => {
      if ((data as { type?: string }).type === 'aionrs_session_bound') {
        const sid = String((data as { data?: unknown }).data ?? '').trim();
        if (sid) void this.persistAionrsSessionId(sid);
        return;
      }

      const contentTypes = ['content', 'tool_group'];
      if (contentTypes.includes(data.type) && this.status !== 'running') {
        this.status = 'running';
      }

      if (data.type === 'start') {
        this.status = 'running';
        if (data.msg_id) {
          this.activeTurnId = data.msg_id;
        }
        emitAionrsTurnCompleted(this, this.activeTurnId ?? this.conversation_id, 'ai_generating');
        ipcBridge.conversation.responseStream.emit({
          type: 'request_trace',
          conversation_id: this.conversation_id,
          msg_id: uuid(),
          data: {
            agentType: 'aionrs' as const,
            provider: this.model.name,
            modelId: this.model.useModel,
            baseUrl: this.model.baseUrl,
            platform: this.model.platform,
            timestamp: Date.now(),
          },
        });
      }

      data.conversation_id = this.conversation_id;

      if (data.type === 'error') {
        this.status = 'finished';
        emitAionrsTurnCompleted(this, this.activeTurnId ?? data.msg_id ?? this.conversation_id, 'error');
        // Auto-fix common "protocol mismatch" issues for gateway providers (LiteLLM/new-api).
        // Example error:
        // "The model does not support the [\"anthropic\",\"claude_code\"] protocols, it only supports [\"openai\"]."
        const errText = String((data as { data?: unknown }).data ?? '');
        void this.maybeAutoFixProtocolMismatch(errText).catch(() => {});
      }

      // Transform and persist message (skip transient UI state)
      const skipTransformTypes = ['thought', 'finished', 'start', 'finish'];
      if (data.type === 'finish') {
        this.status = 'finished';
        emitAionrsTurnCompleted(this, this.activeTurnId ?? data.msg_id ?? this.conversation_id);
      }
      if (!skipTransformTypes.includes(data.type)) {
        const tMessage = transformMessage(data as IResponseMessage);
        if (tMessage) {
          addOrUpdateMessage(this.conversation_id, tMessage, 'aionrs');
          if (tMessage.type === 'tool_group') {
            this.handleConformationMessage(tMessage);
          }
        }
      }

      ipcBridge.conversation.responseStream.emit(data as IResponseMessage);
    });
  }

  private async maybeAutoFixProtocolMismatch(errorMessage: string): Promise<void> {
    const msg = (errorMessage || '').toLowerCase();
    // Heuristic: only act when upstream explicitly says "only supports openai"
    const looksLikeProtocolMismatch =
      msg.includes('does not support') &&
      msg.includes('protocol') &&
      (msg.includes('only supports ["openai"]') ||
        msg.includes('only supports [\\"openai\\"]') ||
        msg.includes('only supports [openai]'));
    if (!looksLikeProtocolMismatch) return;

    const providerId = this.model.id;
    const modelName = this.model.useModel;
    if (!providerId || !modelName) return;

    const key = `${providerId}::${modelName}`;
    if (AionrsManager.autoFixedProtocolKeys.has(key)) return;
    AionrsManager.autoFixedProtocolKeys.add(key);

    const current = (await ProcessConfig.get('model.config').catch((): IProvider[] => [])) as IProvider[];
    if (!Array.isArray(current) || current.length === 0) return;

    let changed = false;
    const next = current.map((p) => {
      if (p.id !== providerId) return p;
      const modelProtocols = { ...p.modelProtocols };
      // For gateway providers that store per-model routing, force this model to OpenAI protocol.
      modelProtocols[modelName] = 'openai';
      changed = true;
      return {
        ...p,
        modelProtocols,
      };
    });

    if (!changed) return;
    await ProcessConfig.set('model.config', next);
  }

  getMode(): { mode: string; initialized: boolean } {
    return { mode: this.currentMode, initialized: true };
  }

  async setMode(mode: string): Promise<{ success: boolean; data?: { mode: string } }> {
    this.currentMode = mode;
    this.saveSessionMode(mode);
    return { success: true, data: { mode: this.currentMode } };
  }

  private async saveSessionMode(mode: string): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'aionrs') {
        const conversation = result.data;
        db.updateConversation(this.conversation_id, {
          extra: { ...conversation.extra, sessionMode: mode },
        } as Partial<typeof conversation>);
      }
    } catch (error) {
      mainError('[AionrsManager]', 'Failed to save session mode', error);
    }
  }

  confirm(id: string, callId: string, data: string) {
    // Store "always allow" in approval store
    if (data === ToolConfirmationOutcome.ProceedAlways) {
      const confirmation = this.confirmations.find((c) => c.callId === callId);
      if (confirmation?.action) {
        const keys = AionrsApprovalStore.createKeysFromConfirmation(confirmation.action, confirmation.commandType);
        this.approvalStore.approveAll(keys);
      }
    }

    super.confirm(id, callId, data);
    this.emitRuntimeSnapshot();
    return this.postMessagePromise(callId, data);
  }
}
