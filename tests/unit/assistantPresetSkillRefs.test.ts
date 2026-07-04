import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import path from 'path';
import { ASSISTANT_PRESETS } from '../../src/common/config/presets/assistantPresets';

/**
 * Build-time consistency guard for preset skill references (upstream #3445 class).
 *
 * Every skill name listed in a preset's defaultEnabledSkills seeds user config
 * at first run. A typo or a renamed/removed bundled skill leaves assistants
 * with dangling references that fail silently at runtime. This test pins each
 * reference to an actual bundled skill directory with a SKILL.md.
 */

const SKILLS_ROOT = path.resolve(__dirname, '../../src/process/resources/skills');

function bundledSkillExists(name: string): boolean {
  return (
    existsSync(path.join(SKILLS_ROOT, name, 'SKILL.md')) ||
    existsSync(path.join(SKILLS_ROOT, '_builtin', name, 'SKILL.md'))
  );
}

describe('ASSISTANT_PRESETS defaultEnabledSkills references', () => {
  const presetsWithSkills = ASSISTANT_PRESETS.filter(
    (preset) => (preset.defaultEnabledSkills?.length ?? 0) > 0
  );

  it('has at least one preset with default skills (sanity)', () => {
    expect(presetsWithSkills.length).toBeGreaterThan(0);
  });

  for (const preset of presetsWithSkills) {
    it(`preset "${preset.id}" references only bundled skills`, () => {
      const missing = (preset.defaultEnabledSkills ?? []).filter((name) => !bundledSkillExists(name));
      expect(missing, `Missing bundled skills for preset ${preset.id}: ${missing.join(', ')}`).toEqual([]);
    });
  }
});
