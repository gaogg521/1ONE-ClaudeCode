/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DigitalEmployeeRunRecord } from '@/common/types/digitalEmployeeRunTypes';

export type PersonalAgentAutomationConfig = {
  skillIds?: string[];
  preferredModelId?: string;
  providerModelKey?: string;
  instructions?: string;
  /** Latest background run (card status + detail entry). */
  lastRun?: DigitalEmployeeRunRecord;
  /** Recent runs, newest first (capped in repository updates). */
  runHistory?: DigitalEmployeeRunRecord[];
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
