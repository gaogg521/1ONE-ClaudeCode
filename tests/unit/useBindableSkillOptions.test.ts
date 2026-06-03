import { describe, expect, it } from 'vitest';
import {
  encodeLocalSkillId,
  encodeOrgSkillId,
  resolveBindableSkillLabel,
  type BindableSkillOption,
} from '@/renderer/hooks/skills/useBindableSkillOptions';

describe('useBindableSkillOptions helpers', () => {
  const options: BindableSkillOption[] = [
    { value: encodeLocalSkillId('my-skill'), label: 'my-skill', source: 'local', description: '' },
    { value: encodeOrgSkillId('org-1'), label: '小说生成测试', source: 'org', description: '' },
  ];

  it('encodes local and org skill ids', () => {
    expect(encodeLocalSkillId('foo')).toBe('local:foo');
    expect(encodeOrgSkillId('bar')).toBe('org:bar');
  });

  it('resolves labels from encoded ids', () => {
    expect(resolveBindableSkillLabel('local:my-skill', options)).toBe('my-skill');
    expect(resolveBindableSkillLabel('org:org-1', options)).toBe('小说生成测试');
  });
});
