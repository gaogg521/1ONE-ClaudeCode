/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 1ONE Built-in Agent
 *
 * A built-in agent implementation that runs directly in the Node.js main process
 * using OpenAI-compatible API. No external binary required.
 *
 * Usage:
 * ```typescript
 * import { OneAgent } from '@process/agent/one';
 *
 * const agent = new OneAgent({
 *   workspace: '/path/to/workspace',
 *   model: {
 *     provider: 'openai',
 *     useModel: 'gpt-4o',
 *     apiKey: process.env.OPENAI_API_KEY,
 *     baseUrl: 'https://api.openai.com/v1',
 *   },
 *   onEvent: (event) => console.log(event),
 * });
 *
 * await agent.start();
 * await agent.handleCommand({ type: 'message', input: 'Hello', msg_id: '1' });
 * ```
 */

export { OneAgent } from './OneAgent';
export type { OneAgentConfig, OneAgentOptions } from './types';
export * from './tools';
