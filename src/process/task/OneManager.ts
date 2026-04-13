/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageToolGroup, TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';
import { BaseApprovalStore, type IApprovalKey } from '@/common/chat/approval';
import { ToolConfirmationOutcome } from '../agent/gemini/cli/tools/tools';
import { getDatabase } from '@process/services/database';
import { addMessage, addOrUpdateMessage } from '@process/utils/message';
import { uuid } from '@/common/utils';
import { OneAgent } from '../agent/one';
import { buildOneAcpModelInfo, resolveTProviderFromOneCompoundId } from '../agent/one/oneModelInfo';
import type { AionrsEvent, AionrsCommand } from '../agent/one/types';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import type { TChatConversation } from '@/common/config/storage';
import type { AgentType, AgentStatus } from './agentTypes';
import type { IAgentManager, AgentKillReason } from './IAgentManager';
import type { IConfirmation } from '@/common/chat/chatLib';
import { IpcAgentEventEmitter } from './IpcAgentEventEmitter';
import { mainError } from '@process/utils/mainLogger';
import { EventEmitter } from 'events';

// One agent approval key
export type OneApprovalKey = IApprovalKey & {
  action: 'exec' | 'edit' | 'info' | 'mcp';
  identifier?: string;
};

function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name);
}

export class OneApprovalStore extends BaseApprovalStore<OneApprovalKey> {
  static createKeysFromConfirmation(action: string, commandType?: string): OneApprovalKey[] {
    if (action === 'exec' && commandType) {
      return commandType
        .split(',')
        .map((cmd) => cmd.trim())
        .filter(Boolean)
        .filter(isValidCommandName)
        .map((cmd) => ({ action: 'exec' as const, identifier: cmd }));
    }
    if (action === 'edit' || action === 'info' || action === 'mcp') {
      return [{ action: action as OneApprovalKey['action'] }];
    }
    return [];
  }
}

type OneManagerData = {
  workspace: string;
  model: TProviderWithModel;
  conversation_id: string;
  yoloMode?: boolean;
  presetRules?: string;
  maxTokens?: number;
  maxTurns?: number;
  sessionMode?: string;
};

/**
 * 1ONE Built-in Agent Manager
 *
 * Manages the built-in OneAgent that runs directly in the main process
 * without requiring an external binary.
 *
 * This is a special manager that does NOT use ForkTask since the agent
 * runs directly in the main process.
 */
export class OneManager extends EventEmitter implements IAgentManager {
  readonly type: AgentType = 'one';
  workspace: string;
  conversation_id: string;
  status: AgentStatus | undefined = 'pending';
  private currentMode: string = 'default';
  private agent: OneAgent | null = null;
  private data: OneManagerData;
  private _lastActivityAt: number = Date.now();
  readonly lastActivityAt = 0; // Will be updated via getter
  readonly approvalStore = new OneApprovalStore();
  private confirmations: Array<IConfirmation> = [];
  private readonly emitter: IpcAgentEventEmitter;
  private isKilled = false;

  get lastActivityAtGetter(): number {
    return this._lastActivityAt;
  }

  constructor(data: OneManagerData, model: TProviderWithModel) {
    super();
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.data = { ...data, model };
    this.currentMode = data.sessionMode || 'default';
    this.emitter = new IpcAgentEventEmitter();

    // Initialize agent
    void this.start().catch(() => {});
  }

  async start(): Promise<void> {
    // Create the built-in agent
    const systemPrompt = this.buildSystemPrompt();

    this.agent = new OneAgent({
      workspace: this.workspace,
      model: this.data.model,
      systemPrompt,
      maxTokens: this.data.maxTokens,
      maxTurns: this.data.maxTurns,
      autoApprove: this.currentMode === 'yolo' || this.data.yoloMode || false,
      onEvent: (event) => this.handleAgentEvent(event),
    });

    await this.agent.start();

    // Inject history if resuming
    await this.injectHistoryFromDatabase();

    this.status = 'running';
  }

  private buildSystemPrompt(): string {
    const parts: string[] = [
      'You are 1ONE, a helpful AI coding assistant.',
      'You have access to tools for file operations and command execution.',
      'Always use the provided tools when you need to read, write, or edit files.',
      'When executing commands, be careful and explain what you are doing.',
    ];

    if (this.data.presetRules) {
      parts.push('\nAdditional rules:\n' + this.data.presetRules);
    }

    return parts.join('\n');
  }

  private async injectHistoryFromDatabase(): Promise<void> {
    if (!this.agent) return;

    try {
      const result = (await getDatabase()).getConversationMessages(this.conversation_id, 0, 10000);
      const data = result.data || [];
      const lines = data
        .filter((m) => m.type === 'text')
        .slice(-20)
        .map((m) => `${m.position === 'right' ? 'User' : 'Assistant'}: ${(m as { content: { content?: string } }).content?.content || ''}`);
      const text = lines.join('\n').slice(-4000);
      if (text) {
        const cmd: AionrsCommand = {
          type: 'init_history',
          text,
        };
        await this.agent.handleCommand(cmd);
      }
    } catch {
      // ignore history injection errors
    }
  }

  async stop(): Promise<void> {
    if (this.agent) {
      this.agent.kill();
      this.agent = null;
    }
    this.status = 'finished';
  }

  kill(_reason?: AgentKillReason): void {
    void this.stop();
    this.isKilled = true;
    this.removeAllListeners();
  }

  private handleAgentEvent(event: AionrsEvent): void {
    switch (event.type) {
      case 'ready': {
        this.status = 'running';
        break;
      }
      case 'stream_start': {
        this.status = 'running';
        this.emitFrontendMessage({
          type: 'start',
          msg_id: event.msg_id,
          conversation_id: this.conversation_id,
          data: '',
        });
        break;
      }
      case 'text_delta': {
        this.emitFrontendMessage({
          type: 'content',
          msg_id: event.msg_id,
          conversation_id: this.conversation_id,
          data: event.text,
        });
        break;
      }
      case 'stream_end': {
        this.status = 'finished';
        this.emitFrontendMessage({
          type: 'finish',
          msg_id: event.msg_id,
          conversation_id: this.conversation_id,
          data: event.usage ?? '',
        });
        break;
      }
      case 'tool_request': {
        this.emitFrontendMessage({
          type: 'tool_group',
          msg_id: event.msg_id,
          conversation_id: this.conversation_id,
          data: [
            {
              callId: event.call_id,
              name: event.tool.name,
              description: event.tool.description,
              status: 'Confirming' as const,
              renderOutputAsMarkdown: false,
              confirmationDetails: this.mapOneToolConfirmationDetails(event),
            },
          ],
        });
        break;
      }
      case 'tool_result': {
        this.emitFrontendMessage({
          type: 'tool_group',
          msg_id: event.msg_id,
          conversation_id: this.conversation_id,
          data: [
            {
              callId: event.call_id,
              name: event.tool_name,
              description: '',
              status: event.status === 'success' ? ('Success' as const) : ('Error' as const),
              resultDisplay:
                event.output_type === 'diff'
                  ? {
                      fileDiff: event.output,
                      fileName: (event.metadata as Record<string, string> | undefined)?.file_path ?? '',
                    }
                  : event.output,
              renderOutputAsMarkdown: event.output_type === 'text',
            },
          ],
        });
        break;
      }
      case 'error': {
        this.emitFrontendMessage({
          type: 'error',
          msg_id: event.msg_id ?? uuid(),
          conversation_id: this.conversation_id,
          data: event.error.message,
        });
        break;
      }
      default:
        break;
    }
  }

  /**
   * Map OneAgent tool_request to the same confirmation shape as the aionrs worker.
   */
  private mapOneToolConfirmationDetails(event: Extract<AionrsEvent, { type: 'tool_request' }>) {
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

  private tryAutoApproveTool(content: IMessageToolGroup['content'][number]): boolean {
    const type = content.confirmationDetails?.type;
    if (this.currentMode === 'yolo') {
      this.confirm(content.callId, content.callId, ToolConfirmationOutcome.ProceedOnce);
      return true;
    }
    if (this.currentMode === 'autoEdit' || this.currentMode === 'auto_edit') {
      if (type === 'edit' || type === 'info') {
        this.confirm(content.callId, content.callId, ToolConfirmationOutcome.ProceedOnce);
        return true;
      }
    }
    return false;
  }

  private handleConformationMessage(message: IMessageToolGroup): void {
    const confirmingTools = message.content.filter((c) => c.status === 'Confirming');

    for (const content of confirmingTools) {
      if (this.tryAutoApproveTool(content)) continue;

      const action = content.confirmationDetails?.type ?? 'info';
      const commandType =
        action === 'exec' ? (content.confirmationDetails as { rootCommand?: string })?.rootCommand : undefined;
      const keys = OneApprovalStore.createKeysFromConfirmation(action, commandType);
      if (keys.length > 0 && this.approvalStore.allApproved(keys)) {
        this.confirm(content.callId, content.callId, ToolConfirmationOutcome.ProceedOnce);
        continue;
      }

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

  /** Normalize agent events for AcpChat (useAcpMessage) + DB persistence, same channels as other agents. */
  private emitFrontendMessage(msg: IResponseMessage): void {
    const skipPersistTypes = new Set([
      'start',
      'finish',
      'thought',
      'thinking',
      'acp_model_info',
      'acp_context_usage',
      'request_trace',
      'slash_commands_updated',
    ]);

    if (!skipPersistTypes.has(msg.type)) {
      const tMessage = transformMessage(msg);
      if (tMessage) {
        addOrUpdateMessage(this.conversation_id, tMessage, 'one' as any);
        if (tMessage.type === 'tool_group') {
          this.handleConformationMessage(tMessage);
        }
      }
    }

    ipcBridge.conversation.responseStream.emit(msg);
    ipcBridge.acpConversation.responseStream.emit(msg);
  }

  async sendMessage(data: { input: string; msg_id: string; files?: string[] }): Promise<void> {
    const message: TMessage = {
      id: data.msg_id,
      type: 'text',
      position: 'right',
      conversation_id: this.conversation_id,
      content: { content: data.input },
    };
    addMessage(this.conversation_id, message);
    try {
      (await getDatabase()).updateConversation(this.conversation_id, {});
    } catch {
      // Conversation might not exist in DB yet
    }
    this.status = 'pending';
    this._lastActivityAt = Date.now();

    if (!this.agent) {
      throw new Error('Agent not initialized');
    }

    const cmd: AionrsCommand = {
      type: 'message',
      input: data.input,
      msg_id: data.msg_id,
      files: data.files,
    };
    // IMPORTANT: Do not await the full model/tool run here.
    // The renderer expects sendMessage() to return quickly, while streaming updates
    // arrive via responseStream (same as ACP/Aionrs managers).
    void this.agent.handleCommand(cmd).catch((error) => {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.emitFrontendMessage({
        type: 'error',
        msg_id: data.msg_id,
        conversation_id: this.conversation_id,
        data: errMsg,
      });
    });
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
      if (result.success && result.data && (result.data as { type?: string }).type === 'one') {
        const conversation = result.data as { extra?: Record<string, unknown> };
        db.updateConversation(this.conversation_id, {
          extra: { ...conversation.extra, sessionMode: mode },
        });
      }
    } catch (error) {
      mainError('[OneManager]', 'Failed to save session mode', error);
    }
  }

  confirm(_id: string, callId: string, data: string) {
    // Store "always allow" in approval store
    if (data === ToolConfirmationOutcome.ProceedAlways) {
      const confirmation = this.confirmations.find((c) => c.callId === callId);
      if (confirmation?.action) {
        const keys = OneApprovalStore.createKeysFromConfirmation(confirmation.action, confirmation.commandType);
        this.approvalStore.approveAll(keys);
      }
    }

    // Approve the tool in the agent
    if (this.agent) {
      const cmd: AionrsCommand = {
        type: 'tool_approve',
        call_id: callId,
        scope: data === ToolConfirmationOutcome.ProceedAlways ? 'always' : 'once',
      };
      void this.agent.handleCommand(cmd);
    }

    // Remove from confirmations
    this.confirmations = this.confirmations.filter((c) => c.callId !== callId);
  }

  deny(_id: string, callId: string) {
    // Deny the tool in the agent
    if (this.agent) {
      const cmd: AionrsCommand = {
        type: 'tool_deny',
        call_id: callId,
      };
      void this.agent.handleCommand(cmd);
    }

    // Remove from confirmations
    this.confirmations = this.confirmations.filter((c) => c.callId !== callId);
  }

  getConfirmations(): IConfirmation[] {
    return this.confirmations;
  }

  private addConfirmation(data: IConfirmation) {
    // If yoloMode is active, attempt to auto-confirm instead of adding
    if (this.data.yoloMode && data.options && data.options.length > 0) {
      // Select the first "allow" option (usually proceed_once or similar)
      const autoOption = data.options[0];
      setTimeout(() => {
        void this.confirm(data.id, data.callId, autoOption.value as string);
      }, 50);
      return;
    }

    const originIndex = this.confirmations.findIndex((p) => p.id === data.id);
    if (originIndex !== -1) {
      this.confirmations = this.confirmations.map((item, i) => (i === originIndex ? { ...item, ...data } : item));
      this.emitter.emitConfirmationUpdate(this.conversation_id, data);
      return;
    }
    this.confirmations = [...this.confirmations, data];
    this.emitter.emitConfirmationAdd(this.conversation_id, data);
  }

  /**
   * Ensure yoloMode (auto-approve) is enabled for this agent.
   */
  async ensureYoloMode(): Promise<boolean> {
    if (this.data.yoloMode) return true;
    this.data.yoloMode = true;
    return true;
  }

  async getModelInfo(): Promise<AcpModelInfo> {
    return buildOneAcpModelInfo(this.data.model);
  }

  /**
   * Switch OpenAI-compatible provider/model for this conversation and restart the agent.
   */
  async setModel(modelId: string): Promise<AcpModelInfo | null> {
    const next = await resolveTProviderFromOneCompoundId(modelId);
    if (!next) return null;

    this.data.model = next;
    try {
      const db = await getDatabase();
      const res = db.updateConversation(this.conversation_id, { model: next } as Partial<TChatConversation>);
      if (!res.success) {
        mainError('[OneManager]', 'Failed to persist model', res.error);
      }
    } catch (error) {
      mainError('[OneManager]', 'Failed to persist model', error);
    }

    if (this.agent) {
      this.agent.kill();
      this.agent = null;
    }
    this.status = 'pending';
    await this.start();
    return buildOneAcpModelInfo(this.data.model);
  }
}
