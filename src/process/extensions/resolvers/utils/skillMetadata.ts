import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type {
  SkillMetadata,
  SkillMetadataFormat,
  SkillPlatform,
  SkillSourceKind,
} from '@/common/types/skillMetadata';

type SkillMetadataOptions = {
  sourceKind: SkillSourceKind;
  isCustom: boolean;
  sourceLabel?: string;
  targetPlatform?: SkillPlatform;
};

type SkillhubAdapter = {
  entry?: string;
};

type SkillhubConfig = {
  id?: string;
  name?: string;
  description?: string;
  version?: string;
  homepage?: string;
  entry?: string;
  platforms?: unknown;
  common?: {
    entry?: string;
  };
  adapters?: Record<string, string | SkillhubAdapter>;
};

type ParsedFrontmatter = {
  name?: string;
  description?: string;
};

const DEFAULT_TARGET_PLATFORM: SkillPlatform = '1one';

const PLATFORM_ALIASES: Record<string, SkillPlatform> = {
  generic: 'generic',
  common: 'generic',
  one: '1one',
  '1one': '1one',
  aionui: '1one',
  '1one-claudecode': '1one',
  claude: 'claude',
  anthropic: 'claude',
  openclaw: 'openclaw',
  clawhub: 'openclaw',
  cursor: 'cursor',
};

function parseFrontmatter(content: string): ParsedFrontmatter {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatter = frontmatterMatch[1];
  const result: ParsedFrontmatter = {};

  const nameMatch = frontmatter.match(/^name:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  if (nameMatch) {
    result.name = nameMatch[1].trim();
  }

  const descMatch = frontmatter.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
  if (descMatch) {
    result.description = descMatch[1].trim();
  }

  return result;
}

function readUtf8IfExists(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function readSkillhubConfig(skillDir: string): SkillhubConfig | null {
  const skillhubPath = path.join(skillDir, 'skillhub.json');
  const raw = readUtf8IfExists(skillhubPath);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SkillhubConfig;
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Ignore invalid JSON and fall back to legacy mode
  }

  return null;
}

function normalizePlatform(value: string): SkillPlatform | null {
  const normalized = PLATFORM_ALIASES[value.trim().toLowerCase()];
  return normalized ?? null;
}

function normalizePlatforms(input: unknown): SkillPlatform[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const result: SkillPlatform[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const normalized = normalizePlatform(item);
    if (normalized && !result.includes(normalized)) {
      result.push(normalized);
    }
  }

  return result;
}

function getAdapterEntry(adapter: string | SkillhubAdapter | undefined): string | undefined {
  if (!adapter) return undefined;
  if (typeof adapter === 'string') return adapter;
  if (typeof adapter.entry === 'string' && adapter.entry.trim()) {
    return adapter.entry.trim();
  }
  return undefined;
}

function toAbsoluteSkillFile(skillDir: string, relativePath: string | undefined): string | null {
  if (!relativePath) return null;
  const resolvedSkillDir = path.resolve(skillDir);
  const absolutePath = path.resolve(skillDir, relativePath);
  if (absolutePath !== resolvedSkillDir && !absolutePath.startsWith(resolvedSkillDir + path.sep)) {
    return null;
  }
  if (!existsSync(absolutePath)) {
    return null;
  }
  return absolutePath;
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items));
}

function buildLegacySkillMetadata(skillDir: string, options: SkillMetadataOptions): SkillMetadata | null {
  const skillFile = path.join(skillDir, 'SKILL.md');
  const content = readUtf8IfExists(skillFile);
  if (!content) {
    return null;
  }

  const frontmatter = parseFrontmatter(content);
  const name = frontmatter.name || path.basename(skillDir);

  return {
    name,
    description: frontmatter.description || '',
    location: skillFile,
    directory: skillDir,
    runtimeFiles: [skillFile],
    isCustom: options.isCustom,
    sourceKind: options.sourceKind,
    sourceLabel: options.sourceLabel,
    metadataFormat: 'legacy-skill-md',
    platforms: ['generic'],
    adapterPlatforms: [],
    hasCommonLayer: false,
    effective: true,
    warnings: [],
  };
}

function buildSkillhubMetadata(skillDir: string, skillhub: SkillhubConfig, options: SkillMetadataOptions): SkillMetadata | null {
  const fallbackSkill = buildLegacySkillMetadata(skillDir, options);
  const adapters = skillhub.adapters ?? {};
  const targetPlatform = options.targetPlatform ?? DEFAULT_TARGET_PLATFORM;

  const commonEntry =
    (typeof skillhub.common?.entry === 'string' && skillhub.common.entry.trim()) ||
    (typeof skillhub.entry === 'string' && skillhub.entry.trim()) ||
    undefined;

  const commonFile =
    toAbsoluteSkillFile(skillDir, commonEntry) ??
    (commonEntry ? null : toAbsoluteSkillFile(skillDir, 'SKILL.md'));

  const adapterEntries = Object.entries(adapters)
    .map(([platformKey, value]) => {
      const normalizedPlatform = normalizePlatform(platformKey);
      const entry = getAdapterEntry(value);
      if (!normalizedPlatform || !entry) return null;
      return { platform: normalizedPlatform, entry };
    })
    .filter((item): item is { platform: SkillPlatform; entry: string } => Boolean(item));

  const adapterPlatforms = uniq(adapterEntries.map((item) => item.platform)) as SkillPlatform[];

  const targetAdapterEntry = adapterEntries.find((item) => item.platform === targetPlatform)?.entry;
  const targetAdapterFile = toAbsoluteSkillFile(skillDir, targetAdapterEntry);
  const runtimeFiles = uniq([commonFile, targetAdapterFile].filter((item): item is string => Boolean(item)));

  if (runtimeFiles.length === 0 && !fallbackSkill) {
    return null;
  }

  const fallbackName = fallbackSkill?.name || path.basename(skillDir);
  const fallbackDescription = fallbackSkill?.description || '';
  const explicitPlatforms = normalizePlatforms(skillhub.platforms);
  const platforms = uniq(
    [
      ...explicitPlatforms,
      ...(commonFile ? (['generic'] as SkillPlatform[]) : []),
      ...adapterPlatforms,
    ].filter(Boolean)
  ) as SkillPlatform[];

  return {
    name: typeof skillhub.name === 'string' && skillhub.name.trim() ? skillhub.name.trim() : fallbackName,
    description:
      typeof skillhub.description === 'string' && skillhub.description.trim()
        ? skillhub.description.trim()
        : fallbackDescription,
    location: runtimeFiles[0] ?? fallbackSkill?.location ?? path.join(skillDir, 'SKILL.md'),
    directory: skillDir,
    runtimeFiles: runtimeFiles.length > 0 ? runtimeFiles : fallbackSkill?.runtimeFiles ?? [],
    isCustom: options.isCustom,
    sourceKind: options.sourceKind,
    sourceLabel: options.sourceLabel,
    metadataFormat: 'skillhub-json',
    version: typeof skillhub.version === 'string' ? skillhub.version : undefined,
    homepage: typeof skillhub.homepage === 'string' ? skillhub.homepage : undefined,
    platforms: platforms.length > 0 ? platforms : (['generic'] as SkillPlatform[]),
    adapterPlatforms,
    hasCommonLayer: Boolean(commonFile),
    effective: true,
    warnings: targetAdapterEntry && !targetAdapterFile ? [`Missing adapter entry for ${targetPlatform}`] : [],
  };
}

export function readSkillMetadata(skillDir: string, options: SkillMetadataOptions): SkillMetadata | null {
  const skillhub = readSkillhubConfig(skillDir);
  if (skillhub) {
    const structured = buildSkillhubMetadata(skillDir, skillhub, options);
    if (structured) {
      return structured;
    }
  }

  return buildLegacySkillMetadata(skillDir, options);
}

export function detectSkillMetadataFormat(skillDir: string): SkillMetadataFormat {
  return existsSync(path.join(skillDir, 'skillhub.json')) ? 'skillhub-json' : 'legacy-skill-md';
}

export function resolveSkillRuntimeFiles(skillDir: string, targetPlatform: SkillPlatform = DEFAULT_TARGET_PLATFORM): string[] {
  const metadata = readSkillMetadata(skillDir, {
    sourceKind: 'custom',
    isCustom: true,
    targetPlatform,
  });

  return metadata?.runtimeFiles ?? [];
}

export function extractSkillDisplayInfo(skillDir: string): { name: string; description: string } | null {
  const metadata = readSkillMetadata(skillDir, {
    sourceKind: 'external',
    isCustom: false,
  });

  if (!metadata) {
    return null;
  }

  return {
    name: metadata.name,
    description: metadata.description,
  };
}
