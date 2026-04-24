/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import {
  liteLlmOpenAiProtocolHeaders,
  shouldAttachLiteLlmOpenAiProtocolHeader,
} from '@/common/utils/litellmGateway';
import type { AionrsEvent, AionrsCommand, OneAgentConfig, OpenAIMessage, OpenAIToolCall } from './types';
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
          ...(shouldAttachLiteLlmOpenAiProtocolHeader(model) ? liteLlmOpenAiProtocolHeaders() : {}),
        },
        body: JSON.stringify(buildBody(useMaxCompletionTokens)),
        signal: this.abortController?.signal,
      });
    };

    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

    let useMaxCompletionTokens = false;
    let response = await doFetch(useMaxCompletionTokens);
    let transientAttempt = 0;
    const maxTransientRetries = 2; // 502/503/504: up to 3 total tries (common with LiteLLM → Azure cold paths)

    while (!response.ok) {
      const errorText = await response.text();
      const lower = errorText.toLowerCase();

      // Some OpenAI/Azure/LiteLLM routes reject `max_tokens` and require `max_completion_tokens`.
      const shouldRetryWithMaxCompletionTokens =
        !useMaxCompletionTokens &&
        lower.includes("unsupported parameter") &&
        lower.includes("'max_tokens'") &&
        lower.includes('max_completion_tokens');
      if (shouldRetryWithMaxCompletionTokens) {
        useMaxCompletionTokens = true;
        response = await doFetch(useMaxCompletionTokens);
        continue;
      }

      // Gateway upstream timeouts (e.g. LiteLLM wrapping Azure 503 as 502) — short backoff retry.
      const isTransientHttp =
        response.status === 502 || response.status === 503 || response.status === 504;
      if (isTransientHttp && transientAttempt < maxTransientRetries) {
        transientAttempt++;
        await sleep(400 * transientAttempt);
        response = await doFetch(useMaxCompletionTokens);
        continue;
      }

      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    // Gateways / "Unary" debug paths often return a single JSON `chat.completion` (not SSE) even when
    // the client sends `stream: true`. Match the OpenAI spec shape from the user's LiteLLM example.
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json') && !contentType.includes('text/event-stream')) {
      const raw = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        throw new Error(`Expected JSON chat completion, parse failed: ${(e as Error).message}`, { cause: e });
      }
      const root = parsed as Record<string, unknown>;
      if (root.object === 'chat.completion') {
        return this.applyUnaryChatCompletion(root, msgId);
      }
      const apiErr = root.error as Record<string, unknown> | undefined;
      const detail =
        typeof apiErr?.message === 'string'
          ? apiErr.message
          : typeof root.message === 'string'
            ? root.message
            : raw.slice(0, 500);
      throw new Error(`Unexpected JSON response (expected chat.completion): ${detail}`);
    }

    // Process streaming response (SSE) — OpenAI `chat.completion.chunk` lines:
    // - optional empty sentinel: choices: []
    // - deltas with delta.content (possibly "")
    // - final usage may arrive on a chunk with choices: [] (LiteLLM / gateway pattern)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    let fullContent = '';
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
    let inputTokens = 0;
    let outputTokens = 0;

    const applySseJsonPayload = (payload: string) => {
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        const choice0 = (parsed.choices as Array<Record<string, unknown>> | undefined)?.[0];
        const delta = choice0?.delta as Record<string, unknown> | undefined;

        const piece = delta?.content;
        if (typeof piece === 'string' && piece.length > 0) {
          fullContent += piece;
          this.options.onEvent({
            type: 'text_delta',
            text: piece,
            msg_id: msgId,
          });
        }

        const deltaToolCalls = delta?.tool_calls;
        if (Array.isArray(deltaToolCalls)) {
          for (const tc of deltaToolCalls as Array<Record<string, unknown>>) {
            const existing = toolCalls.find(t => t.id === tc.id);
            const rawArgs = (tc.function as Record<string, unknown> | undefined)?.arguments;
            const argText = typeof rawArgs === 'string' ? rawArgs : '{}';
            if (existing) {
              existing.arguments = JSON.parse(argText) as Record<string, unknown>;
            } else {
              toolCalls.push({
                id: String(tc.id ?? ''),
                name: String((tc.function as Record<string, unknown> | undefined)?.name || ''),
                arguments: JSON.parse(argText) as Record<string, unknown>,
              });
            }
          }
        }

        const usage = parsed.usage as Record<string, unknown> | undefined;
        if (usage) {
          inputTokens = Number(usage.prompt_tokens) || 0;
          outputTokens = Number(usage.completion_tokens) || 0;
        }
      } catch {
        // Ignore parse errors for malformed chunks
      }
    };

    let sseBuffer = '';
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        sseBuffer += decoder.decode(value ?? new Uint8Array(0), { stream: !done });

        if (done) {
          const lines = sseBuffer.split('\n');
          for (const rawLine of lines) {
            const line = rawLine.replace(/\r$/, '').trim();
            if (!line.startsWith('data: ')) continue;
            applySseJsonPayload(line.slice(6).trim());
          }
          break;
        }

        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';
        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '').trim();
          if (!line.startsWith('data: ')) continue;
          applySseJsonPayload(line.slice(6).trim());
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

  /**
   * Handle non-streaming `chat.completion` JSON (OpenAI spec), including optional `message.tool_calls`.
   */
  private applyUnaryChatCompletion(
    obj: Record<string, unknown>,
    msgId: string
  ): {
    content: string;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    inputTokens: number;
    outputTokens: number;
  } {
    const choices = obj.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const content = typeof message?.content === 'string' ? message.content : '';
    if (content) {
      this.options.onEvent({
        type: 'text_delta',
        text: content,
        msg_id: msgId,
      });
    }

    const rawToolCalls = message?.tool_calls as Array<Record<string, unknown>> | undefined;
    const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];
    const historyToolCalls: OpenAIToolCall[] = [];

    if (Array.isArray(rawToolCalls)) {
      for (const tc of rawToolCalls) {
        const fn = tc.function as Record<string, unknown> | undefined;
        const name = typeof fn?.name === 'string' ? fn.name : '';
        const argStr = typeof fn?.arguments === 'string' ? fn.arguments : '{}';
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(argStr) as Record<string, unknown>;
        } catch {
          args = {};
        }
        const id = String(tc.id ?? '');
        toolCalls.push({ id, name, arguments: args });
        historyToolCalls.push({
          id,
          type: 'function',
          function: { name, arguments: argStr },
        });
      }
    }

    const usage = obj.usage as Record<string, unknown> | undefined;
    const inputTokens = Number(usage?.prompt_tokens) || 0;
    const outputTokens = Number(usage?.completion_tokens) || 0;

    const assistantMsg: OpenAIMessage =
      toolCalls.length > 0
        ? { role: 'assistant', content: content || '', tool_calls: historyToolCalls }
        : { role: 'assistant', content };
    this.messageHistory.push(assistantMsg);

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      inputTokens,
      outputTokens,
    };
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
