/**
 * Assistants & Skills invocation — E2E tests.
 *
 * Ported (by scenario, not by file) from upstream AionUi's
 * tests/e2e/features/assistants + settings/skills suites. Upstream's specs
 * drive the redesigned single-list UI via data-testid attributes that this
 * fork's drawer-based UI does not have, so these tests validate the same
 * invariants at the bridge level instead:
 *
 *  1. The skill catalog is readable and unified (available + auto/_builtin).
 *  2. Preset assistants seeded in config only reference resolvable skills.
 *  3. A conversation created with enabledSkills surfaces those skills in the
 *     slash command menu (source: 'skill', insert behavior) — the explicit
 *     invocation path added 2026-07-04.
 */
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers';

type SkillEntry = { name: string; description?: string };
type AssistantEntry = { id: string; enabled?: boolean; enabledSkills?: string[]; isPreset?: boolean };
type SlashCommand = { name: string; source: string; kind: string; selectionBehavior?: string };

test.describe('Assistants & Skills', () => {
  test.setTimeout(90_000);

  test('skill catalog lists available and auto (_builtin) skills', async ({ page }) => {
    const available = await invokeBridge<SkillEntry[]>(page, 'list-available-skills');
    const auto = await invokeBridge<SkillEntry[]>(page, 'list-auto-skills');

    expect(Array.isArray(available)).toBe(true);
    expect(Array.isArray(auto)).toBe(true);
    // Bundled skills ship with the app — an empty catalog means the copy step broke.
    expect(available.length).toBeGreaterThan(0);
    expect(auto.length).toBeGreaterThan(0);
    // Every entry must carry a resolvable name.
    for (const skill of [...available, ...auto]) {
      expect(typeof skill.name).toBe('string');
      expect(skill.name.length).toBeGreaterThan(0);
    }
  });

  test('enabled preset assistants only reference resolvable skills', async ({ page }) => {
    const assistants = (await invokeBridge<AssistantEntry[]>(page, 'agent.config.storage.get', 'acp.customAgents')) || [];
    const available = await invokeBridge<SkillEntry[]>(page, 'list-available-skills');
    const auto = await invokeBridge<SkillEntry[]>(page, 'list-auto-skills');
    const catalog = new Set([...available, ...auto].map((skill) => skill.name));

    const brokenRefs: string[] = [];
    for (const assistant of assistants) {
      if (assistant.enabled === false) continue;
      for (const name of assistant.enabledSkills || []) {
        if (!catalog.has(name)) {
          brokenRefs.push(`${assistant.id} -> ${name}`);
        }
      }
    }
    expect(brokenRefs, `Assistants reference skills missing from the catalog: ${brokenRefs.join(', ')}`).toEqual([]);
  });

  test('conversation with enabledSkills surfaces them in the slash menu', async ({ page }) => {
    const available = await invokeBridge<SkillEntry[]>(page, 'list-available-skills');
    test.skip(available.length < 2, 'needs at least two catalog skills');
    const picked = available.slice(0, 2).map((skill) => skill.name);

    const conversation = await invokeBridge<{ id?: string }>(page, 'create-conversation', {
      type: 'gemini',
      name: 'E2E assistants-skills (auto-delete)',
      model: { id: 'e2e-test', platform: 'gemini', name: 'e2e-test', useModel: 'gemini-2.5-flash' },
      extra: { workspace: '', enabledSkills: picked },
    });
    expect(conversation?.id, 'conversation should be created').toBeTruthy();

    try {
      const response = await invokeBridge<{ success: boolean; data?: { commands: SlashCommand[] } }>(
        page,
        'conversation.get-slash-commands',
        { conversation_id: conversation.id }
      );
      expect(response.success).toBe(true);
      const skillCommands = (response.data?.commands || []).filter((cmd) => cmd.source === 'skill');
      const names = skillCommands.map((cmd) => cmd.name);
      for (const name of picked) {
        expect(names, `skill "${name}" should appear in the slash menu`).toContain(name);
      }
      // Selecting a skill fills "/name " into the input (upstream #3482 UX).
      for (const cmd of skillCommands) {
        expect(cmd.kind).toBe('template');
        expect(cmd.selectionBehavior).toBe('insert');
      }
    } finally {
      await invokeBridge(page, 'remove-conversation', { id: conversation.id });
    }
  });

  test('conversation without enabledSkills gets no skill slash commands', async ({ page }) => {
    const conversation = await invokeBridge<{ id?: string }>(page, 'create-conversation', {
      type: 'gemini',
      name: 'E2E no-skills (auto-delete)',
      model: { id: 'e2e-test', platform: 'gemini', name: 'e2e-test', useModel: 'gemini-2.5-flash' },
      extra: { workspace: '' },
    });
    expect(conversation?.id).toBeTruthy();

    try {
      const response = await invokeBridge<{ success: boolean; data?: { commands: SlashCommand[] } }>(
        page,
        'conversation.get-slash-commands',
        { conversation_id: conversation.id }
      );
      expect(response.success).toBe(true);
      const skillCommands = (response.data?.commands || []).filter((cmd) => cmd.source === 'skill');
      expect(skillCommands).toEqual([]);
    } finally {
      await invokeBridge(page, 'remove-conversation', { id: conversation.id });
    }
  });
});
