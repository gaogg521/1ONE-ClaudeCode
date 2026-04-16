import type { Message } from '@arco-design/web-react';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import type { ExternalSkillSource, SkillMetadata } from '@/common/types/skillMetadata';

// Skill info type
export type SkillInfo = SkillMetadata;

// External source type
export type ExternalSource = ExternalSkillSource;

// Pending skill to import
export type PendingSkill = {
  path: string;
  name: string;
  description: string;
};

export type AssistantManagementProps = {
  message: ReturnType<typeof Message.useMessage>[0];
};

export type AssistantListItem = AcpBackendConfig & {
  _source?: string;
  _extensionName?: string;
  _kind?: string;
};
