/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { existsSync } from 'fs';
import type { LoadedExtension, ExtSkill } from '../types';
import type { SkillMetadata } from '@/common/types/skillMetadata';
import { isPathWithinDirectory } from '../sandbox/pathSafety';
import { readSkillMetadata } from './utils/skillMetadata';

type ResolvedSkill = SkillMetadata;

export function resolveSkills(extensions: LoadedExtension[]): ResolvedSkill[] {
  const skills: ResolvedSkill[] = [];
  for (const ext of extensions) {
    const declaredSkills = ext.manifest.contributes.skills;
    if (!declaredSkills || declaredSkills.length === 0) continue;
    for (const skill of declaredSkills) {
      const resolved = convertSkill(skill, ext);
      if (resolved) {
        skills.push(resolved);
      }
    }
  }
  return skills;
}

function convertSkill(skill: ExtSkill, ext: LoadedExtension): ResolvedSkill | null {
  const absolutePath = path.resolve(ext.directory, skill.file);
  if (!isPathWithinDirectory(absolutePath, ext.directory)) {
    console.warn(`[Extensions] Skill file path traversal attempt: ${skill.file} in ${ext.manifest.name}`);
    return null;
  }
  if (!existsSync(absolutePath)) {
    console.warn(`[Extensions] Skill file not found: ${absolutePath} (extension: ${ext.manifest.name})`);
    return null;
  }

  const skillDir = path.dirname(absolutePath);
  const metadata = readSkillMetadata(skillDir, {
    sourceKind: 'extension',
    isCustom: false,
    sourceLabel: ext.manifest.displayName,
  });

  if (!metadata) {
    return {
      name: skill.name,
      description: skill.description || `Skill from extension: ${ext.manifest.name}`,
      location: absolutePath,
      directory: skillDir,
      runtimeFiles: [absolutePath],
      isCustom: false,
      sourceKind: 'extension',
      sourceLabel: ext.manifest.displayName,
      metadataFormat: 'legacy-skill-md',
      platforms: ['generic'],
      adapterPlatforms: [],
      hasCommonLayer: false,
      effective: true,
      warnings: [],
    };
  }

  return {
    ...metadata,
    name: metadata.name || skill.name,
    description: metadata.description || skill.description || `Skill from extension: ${ext.manifest.name}`,
    location: absolutePath,
    runtimeFiles: metadata.runtimeFiles.length > 0 ? metadata.runtimeFiles : [absolutePath],
  };
}
