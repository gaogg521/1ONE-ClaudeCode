/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isProviderLiteLlmProxy,
  liteLlmOpenAiProtocolHeaders,
  modelIdLooksLikeLitellmProxy,
  shouldAttachLiteLlmOpenAiProtocolHeader,
  shouldSendOpenAiCompletionsApiHeader,
} from '@/common/utils/litellmGateway';
import { getProviderAuthType } from '@/common/utils/platformAuthType';

describe('isProviderLiteLlmProxy', () => {
  it('returns true when litellmProxy flag is set', () => {
    expect(isProviderLiteLlmProxy({ litellmProxy: true, baseUrl: 'https://gateway.internal' })).toBe(true);
  });

  it('detects litellm in baseUrl', () => {
    expect(isProviderLiteLlmProxy({ baseUrl: 'https://my-LiteLLM.example.com/v1' })).toBe(true);
  });

  it('detects litellm in name', () => {
    expect(isProviderLiteLlmProxy({ name: 'Company LiteLLM' })).toBe(true);
  });

  it('returns false for ordinary OpenAI-compatible host', () => {
    expect(isProviderLiteLlmProxy({ baseUrl: 'https://api.openai.com/v1' })).toBe(false);
  });

  it('detects litellm/ model id on useModel', () => {
    expect(isProviderLiteLlmProxy({ useModel: 'litellm/gemini-3.1-pro-preview', baseUrl: 'https://gw.internal/v1' })).toBe(
      true
    );
    expect(modelIdLooksLikeLitellmProxy('LITELLM/gemini-3.1-pro-preview')).toBe(true);
  });

  it('detects litellm/ in provider model list', () => {
    expect(
      isProviderLiteLlmProxy({
        baseUrl: 'https://gw.internal/v1',
        model: ['gpt-4o', 'litellm/gemini-2.5-flash'],
      })
    ).toBe(true);
  });

  it('does not treat bare "litellm" model name as proxy prefix', () => {
    expect(modelIdLooksLikeLitellmProxy('litellm')).toBe(false);
  });
});

describe('shouldAttachLiteLlmOpenAiProtocolHeader', () => {
  it('is true for new-api platform', () => {
    expect(shouldAttachLiteLlmOpenAiProtocolHeader({ platform: 'new-api' })).toBe(true);
  });

  it('is true when baseUrl contains litellm', () => {
    expect(shouldAttachLiteLlmOpenAiProtocolHeader({ platform: 'custom', baseUrl: 'https://litellm.example/v1' })).toBe(true);
  });

  it('is false for plain custom OpenAI without litellm', () => {
    expect(shouldAttachLiteLlmOpenAiProtocolHeader({ platform: 'custom', baseUrl: 'https://api.openai.com/v1' })).toBe(false);
  });

  it('matches deprecated shouldSendOpenAiCompletionsApiHeader alias', () => {
    const p = { platform: 'new-api' as const };
    expect(shouldSendOpenAiCompletionsApiHeader(p)).toBe(shouldAttachLiteLlmOpenAiProtocolHeader(p));
  });
});

describe('liteLlmOpenAiProtocolHeaders', () => {
  it('sends Api openai-completions first and Protocol openai as compat', () => {
    expect(liteLlmOpenAiProtocolHeaders()).toEqual({
      Api: 'openai-completions',
      Protocol: 'openai',
    });
  });
});

describe('getProviderAuthType + LiteLLM', () => {
  it('maps authType openai-completions to openai', () => {
    expect(
      getProviderAuthType({
        platform: 'custom',
        authType: 'openai-completions',
        baseUrl: 'https://api.openai.com/v1',
      })
    ).toBe('openai');
  });

  it('maps new-api per-model gemini protocol to openai when baseUrl is LiteLLM', () => {
    expect(
      getProviderAuthType({
        platform: 'new-api',
        useModel: 'gemini-flash',
        modelProtocols: { 'gemini-flash': 'gemini' },
        baseUrl: 'https://litellm.corp/v1',
      })
    ).toBe('openai');
  });

  it('forces openai for LiteLLM when new-api per-model protocol is anthropic (relay uses chat/completions)', () => {
    expect(
      getProviderAuthType({
        platform: 'new-api',
        useModel: 'claude-sonnet',
        modelProtocols: { 'claude-sonnet': 'anthropic' },
        baseUrl: 'https://litellm.corp/v1',
      })
    ).toBe('openai');
  });

  it('keeps gemini for non-LiteLLM new-api gateway', () => {
    expect(
      getProviderAuthType({
        platform: 'new-api',
        useModel: 'gemini-flash',
        modelProtocols: { 'gemini-flash': 'gemini' },
        baseUrl: 'https://some-other-gateway.com',
      })
    ).toBe('gemini');
  });

  it('maps gemini protocol to openai when useModel uses litellm/ prefix (no litellm in host)', () => {
    expect(
      getProviderAuthType({
        platform: 'new-api',
        useModel: 'litellm/gemini-3.1-pro-preview',
        modelProtocols: { 'litellm/gemini-3.1-pro-preview': 'gemini' },
        baseUrl: 'https://gateway.internal/v1',
      })
    ).toBe('openai');
  });
});
