/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext } from 'react';

export type EnterpriseGateValue = {
  status: 'loading' | 'ready';
  eligible: boolean;
  elevated: boolean;
  refetch: () => Promise<void>;
};

const defaultValue: EnterpriseGateValue = {
  status: 'ready',
  eligible: false,
  elevated: false,
  refetch: async () => {},
};

const EnterpriseGateContext = createContext<EnterpriseGateValue>(defaultValue);

export const EnterpriseGateProvider: React.FC<{
  value: EnterpriseGateValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return <EnterpriseGateContext.Provider value={value}>{children}</EnterpriseGateContext.Provider>;
};

export function useEnterpriseGate(): EnterpriseGateValue {
  return useContext(EnterpriseGateContext);
}
