export const SKILL_PLATFORMS = ['generic', '1one', 'claude', 'openclaw', 'cursor'] as const;

export type SkillPlatform = (typeof SKILL_PLATFORMS)[number];

export type SkillMetadataFormat = 'legacy-skill-md' | 'skillhub-json';

export type SkillSourceKind = 'builtin' | 'custom' | 'external' | 'extension';

export type SkillShadowInfo = {
  byName: string;
  byDirectory: string;
  bySourceKind: SkillSourceKind;
  bySourceLabel?: string;
};

export type SkillMetadata = {
  name: string;
  description: string;
  location: string;
  directory: string;
  runtimeFiles: string[];
  isCustom: boolean;
  sourceKind: SkillSourceKind;
  sourceLabel?: string;
  metadataFormat: SkillMetadataFormat;
  version?: string;
  homepage?: string;
  platforms: SkillPlatform[];
  adapterPlatforms: SkillPlatform[];
  hasCommonLayer: boolean;
  effective: boolean;
  shadowedBy?: SkillShadowInfo;
  warnings: string[];
};

export type ExternalSkillSource = {
  name: string;
  path: string;
  source: string;
  skills: SkillMetadata[];
};
