/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export protocol types from aionrs for compatibility
export type {
  AionrsEvent,
  AionrsCommand,
  ToolCategory,
  ToolInfo,
  TokenUsage,
} from '../aionrs/protocol';

// Re-export OneAgentOptions from OneAgent
export type { OneAgentOptions } from './OneAgent';

// OpenAI-compatible API types
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string | null;
  }>;
}

export interface OneAgentConfig {
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens?: number;
  maxTurns?: number;
  systemPrompt?: string;
  autoApprove?: boolean;
}
