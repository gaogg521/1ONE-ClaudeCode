import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetSkill, mockDiscoverSkills, mockHasSkill } = vi.hoisted(() => ({
  mockGetSkill: vi.fn(),
  mockDiscoverSkills: vi.fn(async () => {}),
  mockHasSkill: vi.fn(() => true),
}));

vi.mock('@process/task/AcpSkillManager', () => ({
  AcpSkillManager: {
    getInstance: vi.fn(() => ({
      discoverSkills: mockDiscoverSkills,
      hasSkill: mockHasSkill,
      getSkill: mockGetSkill,
    })),
  },
}));

import {
  parseSlashInvocation,
  expandSlashSkillInvocation,
} from '@process/services/agentToolkit/slashSkillInvocation';

describe('parseSlashInvocation', () => {
  it('parses "/name args" into name and args', () => {
    expect(parseSlashInvocation('/officecli-docx write a report')).toEqual({
      name: 'officecli-docx',
      args: 'write a report',
    });
  });

  it('parses bare "/name" with empty args', () => {
    expect(parseSlashInvocation('/mermaid')).toEqual({ name: 'mermaid', args: '' });
  });

  it('tolerates surrounding whitespace and multi-line args', () => {
    expect(parseSlashInvocation('  /pdf merge these:\nfile1\nfile2 ')).toEqual({
      name: 'pdf',
      args: 'merge these:\nfile1\nfile2',
    });
  });

  it('returns null for non-slash input', () => {
    expect(parseSlashInvocation('hello world')).toBeNull();
    expect(parseSlashInvocation('use /pdf please')).toBeNull();
    expect(parseSlashInvocation('')).toBeNull();
  });

  it('returns null for invalid command charset', () => {
    expect(parseSlashInvocation('/名字')).toBeNull();
    expect(parseSlashInvocation('/a.b')).toBeNull();
  });
});

describe('expandSlashSkillInvocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasSkill.mockReturnValue(true);
    mockGetSkill.mockResolvedValue({
      name: 'officecli-docx',
      description: 'docx skill',
      location: '/skills/officecli-docx/SKILL.md',
      body: 'DOCX INSTRUCTIONS',
    });
  });

  it('expands an enabled skill with the user args as request', async () => {
    const result = await expandSlashSkillInvocation('/officecli-docx write a Q1 report', ['officecli-docx']);
    expect(result).toContain('[Skill: officecli-docx]');
    expect(result).toContain('DOCX INSTRUCTIONS');
    expect(result).toContain('[User Request]\nwrite a Q1 report');
  });

  it('uses a default request when no args are given', async () => {
    const result = await expandSlashSkillInvocation('/officecli-docx', ['officecli-docx']);
    expect(result).toContain('Use the "officecli-docx" skill');
  });

  it('returns null when the name is not in enabledSkills (left for ACP-native commands)', async () => {
    expect(await expandSlashSkillInvocation('/compact', ['officecli-docx'])).toBeNull();
    expect(mockDiscoverSkills).not.toHaveBeenCalled();
  });

  it('returns null when enabledSkills is empty or undefined', async () => {
    expect(await expandSlashSkillInvocation('/officecli-docx', [])).toBeNull();
    expect(await expandSlashSkillInvocation('/officecli-docx', undefined)).toBeNull();
  });

  it('returns null for plain text input', async () => {
    expect(await expandSlashSkillInvocation('hello', ['officecli-docx'])).toBeNull();
  });

  it('returns null when the skill body cannot be loaded', async () => {
    mockGetSkill.mockResolvedValue({ name: 'officecli-docx', body: '' });
    expect(await expandSlashSkillInvocation('/officecli-docx do it', ['officecli-docx'])).toBeNull();
  });
});
