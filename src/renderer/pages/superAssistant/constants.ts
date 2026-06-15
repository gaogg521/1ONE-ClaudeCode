export const SUPER_ASSISTANT_TABS = ['overview', 'issues', 'agents', 'skills', 'settings'] as const;

export type SuperAssistantTab = (typeof SUPER_ASSISTANT_TABS)[number];
