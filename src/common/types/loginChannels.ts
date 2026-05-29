/**
 * Login channel identifiers shared by WebUI auth providers and org sync.
 *
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export const LOGIN_CHANNEL_PROVIDERS = ['ldap', 'feishu', 'dingtalk', 'wecom', 'smtp'] as const;

export type LoginChannelProvider = (typeof LOGIN_CHANNEL_PROVIDERS)[number];

export function isLoginChannelProvider(value: string): value is LoginChannelProvider {
  return (LOGIN_CHANNEL_PROVIDERS as readonly string[]).includes(value);
}
