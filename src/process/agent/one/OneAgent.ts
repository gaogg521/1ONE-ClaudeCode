/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import type { AionrsEvent, AionrsCommand, OneAgentConfig, OpenAIMessage } from './types';
import { EventEmitter } from 'events';
import { OneToolExecutor } from './tools/OneToolExecutor';

export interface OneAgentOptions {
  workspace: string;
  model: TProviderWithModel;
  systemPrompt?: string;
  maxTokens?: number;
  maxTurns?: number;
  autoApprove?: boolean;
  onEvent: (event: AionrsEvent) => void;
}

/**
 * Built-in 1ONE Agent - Node.js implementation
 * Uses OpenAI-compatible API directly, no external binary needed
 */
export class OneAgent extends EventEmitter {
  private options: OneAgentOptions;
  private toolExecutor: OneToolExecutor;
  private messageHistory: OpenAIMessage[] = [];
  private sessionId: string;
  private isRunning = false;
  private abortController: AbortController | null = null;
  private turnCount = 0;

  constructor(options: OneAgentOptions) {
    super();
    this.options = options;
    this.sessionId = this.generateSessionId();
    this.toolExecutor = new OneToolExecutor(options.workspace, options.autoApprove ?? false);
  }

  async start(): Promise<void> {
    // Send ready event
    this.options.onEvent({
      type: 'ready',
      version: '1.0.0-node',
      session_id: this.sessionId,
      capabilities: {
        tool_approval: !this.options.autoApprove,
        thinking: false,
        mcp: false, // TODO: Add MCP support
      },
    });
  }

  async handleCommand(cmd: AionrsCommand): Promise<void> {
    switch (cmd.type) {
      case 'message':
        await this.handleMessage(cmd.input, cmd.msg_id, cmd.files);
        break;
      case 'stop':
        this.handleStop();
        break;
      case 'tool_approve':
        await this.toolExecutor.approveTool(cmd.call_id, cmd.scope);
        break;
      case 'tool_deny':
        await this.toolExecutor.denyTool(cmd.call_id, cmd.reason);
        break;
      case 'init_history':
        this.handleInitHistory(cmd.text);
        break;
    }
  }

  private async handleMessage(input: string, msgId: string, files?: string[]): Promise<void> {
    if (this.isRunning) {
      this.options.onEvent({
        type: 'error',
        msg_id: msgId,
        error: { code: 'BUSY', message: 'Agent is already processing a message', retryable: true },
      });
      return;
    }

    // Check turn limit
    if (this.options.maxTurns && this.turnCount >= this.options.maxTurns) {
      this.options.onEvent({
        type: 'text_delta',
        text: '\n[Max turns reached]',
        msg_id: msgId,
      });
      this.options.onEvent({
        type: 'stream_end',
        msg_id: msgId,
      });
      return;
    }

    this.isRunning = true;
    this.turnCount++;
    this.abortController = new AbortController();

    try {
      // Start stream
      this.options.onEvent({
        type: 'stream_start',
        msg_id: msgId,
      });

      // Build user message with file context
      let userContent = input;
      if (files && files.length > 0) {
        const fileContents = await this.readFiles(files);
        userContent = `${fileContents}\n\n${input}`;
      }

      // Add to history
      this.messageHistory.push({
        role: 'user',
        content: userContent,
      });

      // Call OpenAI-compatible API
      const response = await this.callOpenAIAPI(msgId);

      // Handle tool calls if present
      if (response.toolCalls && response.toolCalls.length > 0) {
        await this.handleToolCalls(response.toolCalls, msgId);
      }

      // End stream
      this.options.onEvent({
        type: 'stream_end',
        msg_id: msgId,
        usage: {
          input_tokens: response.inputTokens,
          output_tokens: response.outputTokens,
        },
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.options.onEvent({
        type: 'error',
        msg_id: msgId,
        error: { code: 'API_ERROR', message: errMsg, retryable: true },
      });
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  private async callOpenAIAPI(msgId: string): Promise<{
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    inputTokens: number;
    outputTokens: number;
  }> {
    const model = this.options.model;
    const baseUrl = this.normalizeBaseUrl(model.baseUrl);
    const apiKey = model.apiKey;

    if (!apiKey) {
      throw new Error('API key is required. Please configure it in Settings → Models.');
    }

    // Prepare messages
    const messages: OpenAIMessage[] = [];
    if (this.options.systemPrompt) {
      messages.push({ role: 'system', content: this.options.systemPrompt });
    }
    messages.push(...this.messageHistory);

    // Prepare tools
    const tools = this.toolExecutor.getToolDefinitions();

    // Call API
    const url = `${baseUrl}/chat/completions`;
    const buildBody = (useMaxCompletionTokens: boolean) => {
      const body: Record<string, unknown> = {
        model: model.useModel,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        stream: true,
      };
      if (this.options.maxTokens) {
        if (useMaxCompletionTokens) {
          body.max_completion_tokens = this.options.maxTokens;
        } else {
          body.max_tokens = this.options.maxTokens;
        }
      }
      return body;
    };

    const doFetch = async (useMaxCompletionTokens: boolean) => {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildBody(useMaxCompletionTokens)),
        signal: this.abortController?.signal,
      });
    };

    let response = await doFetch(false);

    if (!response.ok) {
      const errorText = await response.text();
      // Some OpenAI/Azure/LiteLLM routes reject `max_tokens` and require `max_completion_tokens`.
      // Best-effort retry with the alternative parameter to improve compatibility.
      const lower = errorText.toLowerCase();
      const shouldRetryWithMaxCompletionTokens =
        lower.includes("unsupported parameter") &&
        lower.includes("'max_tokens'") &&
        lower.includes('max_completion_tokens');
      if (shouldRetryWithMaxCompletionTokens) {
        response = await doFetch(true);
        if (response.ok) {
          // continue to streaming handling below
        } else {
          const retryErrorText = await response.text();
          throw new Error(`API error ${response.status}: ${retryErrorText}`);
        }
      } else {
        throw new Error(`API error ${response.status}: ${errorText}`);
      }
    }

    // Process streaming response
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    let fullContent = '';
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              fullContent += delta.content;
              this.options.onEvent({
                type: 'text_delta',
                text: delta.content,
                msg_id: msgId,
              });
            }

            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const existing = toolCalls.find(t => t.id === tc.id);
                if (existing) {
                  existing.arguments = JSON.parse(tc.function?.arguments || '{}');
                } else {
                  toolCalls.push({
                    id: tc.id,
                    name: tc.function?.name || '',
                    arguments: JSON.parse(tc.function?.arguments || '{}'),
                  });
                }
              }
            }

            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens || 0;
              outputTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {
            // Ignore parse errors for malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Add assistant message to history
    this.messageHistory.push({
      role: 'assistant',
      content: fullContent,
    });

    return { content: fullContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, inputTokens, outputTokens };
  }

  private async handleToolCalls(
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
    msgId: string
  ): Promise<void> {
    for (const tc of toolCalls) {
      // Request approval
      this.options.onEvent({
        type: 'tool_request',
        msg_id: msgId,
        call_id: tc.id,
        tool: {
          name: tc.name,
          category: this.categorizeTool(tc.name),
          args: tc.arguments,
          description: this.getToolDescription(tc.name, tc.arguments),
        },
      });

      // Execute tool
      const result = await this.toolExecutor.executeTool(tc.id, tc.name, tc.arguments);

      // Send result
      this.options.onEvent({
        type: 'tool_result',
        msg_id: msgId,
        call_id: tc.id,
        tool_name: tc.name,
        status: result.success ? 'success' : 'error',
        output: result.output,
        output_type: result.outputType,
        metadata: result.metadata,
      });

      // Add tool result to history
      this.messageHistory.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result.output,
      });
    }

    // Continue conversation after tool results
    const response = await this.callOpenAIAPI(msgId);

    if (response.content) {
      this.options.onEvent({
        type: 'text_delta',
        text: response.content,
        msg_id: msgId,
      });
    }
  }

  private handleStop(): void {
    this.abortController?.abort();
    this.isRunning = false;
  }

  private handleInitHistory(text: string): void {
    // Clear and set system/history
    this.messageHistory = [];
    if (text) {
      this.messageHistory.push({
        role: 'system',
        content: text,
      });
    }
  }

  private async readFiles(files: string[]): Promise<string> {
    const fs = await import('fs/promises');
    const contents: string[] = [];
    for (const file of files) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        contents.push(`<file path="${file}">\n${content}\n</file>`);
      } catch {
        contents.push(`<file path="${file}">\n[Error reading file]\n</file>`);
      }
    }
    return contents.join('\n');
  }

  private normalizeBaseUrl(url?: string): string {
    if (!url) return 'https://api.openai.com/v1';
    const normalized = url.replace(/\/$/, '');
    if (normalized.endsWith('/v1')) return normalized;
    return `${normalized}/v1`;
  }

  private categorizeTool(name: string): 'edit' | 'exec' | 'mcp' | 'info' {
    if (name.includes('edit') || name.includes('write') || name.includes('apply')) return 'edit';
    if (name.includes('exec') || name.includes('bash') || name.includes('cmd')) return 'exec';
    if (name.includes('mcp')) return 'mcp';
    return 'info';
  }

  private getToolDescription(name: string, args: Record<string, unknown>): string {
    switch (name) {
      case 'read_file':
        return `Read file: ${args.file_path}`;
      case 'edit_file':
        return `Edit file: ${args.file_path}`;
      case 'write_file':
        return `Write file: ${args.file_path}`;
      case 'execute_command':
        return `Execute: ${args.command}`;
      default:
        return `${name}(${JSON.stringify(args)})`;
    }
  }

  private generateSessionId(): string {
    return `one-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  kill(): void {
    this.handleStop();
    this.removeAllListeners();
  }
}
