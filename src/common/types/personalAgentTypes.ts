/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export type PersonalAgentAutomationConfig = {
  skillIds?: string[];
  preferredModelId?: string;
  providerModelKey?: string;
  instructions?: string;
  [key: string]: unknown;
};

export type PersonalAgent = {
  id: string;
  ownerUserId: string;
  tenantId: string;
  name: string;
  description?: string;
  agentType: string;
  conversationType: string;
  customAgentId?: string;
  cliPath?: string;
  automationConfig: PersonalAgentAutomationConfig;
  createdAt: number;
  updatedAt: number;
};

export type CreatePersonalAgentInput = Omit<PersonalAgent, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type UpdatePersonalAgentInput = Partial<
  Pick<
    PersonalAgent,
    | 'name'
    | 'description'
    | 'agentType'
    | 'conversationType'
    | 'customAgentId'
    | 'cliPath'
    | 'automationConfig'
    | 'updatedAt'
  >
>;
