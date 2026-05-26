export const SUPER_ASSISTANT_TABS = [
  'overview',
  'issues',
  'agents',
  'skills',
  'runtimes',
  'settings',
] as const;

export type SuperAssistantTab = (typeof SUPER_ASSISTANT_TABS)[number];
