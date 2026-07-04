/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 斜杠技能显式调用：用户输入 /skill-name [args] 时，把技能全文确定性地注入
 * agent prompt，不再依赖模型主动输出 [LOAD_SKILL] 文本标记。
 * Explicit slash-skill invocation: when the user sends "/skill-name [args]",
 * inject the full skill content deterministically instead of relying on the
 * model to emit the [LOAD_SKILL] text marker.
 */

import { AcpSkillManager } from '@process/task/AcpSkillManager';

// Same charset as the renderer slash menu (useSlashCommandController SLASH_QUERY_RE)
const SLASH_INVOCATION_RE = /^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/;

export interface SlashSkillInvocation {
  name: string;
  args: string;
}

/**
 * 解析 "/name args" 形式的输入。不匹配时返回 null。
 * Parse "/name args" style input. Returns null when it does not match.
 */
export function parseSlashInvocation(input: string): SlashSkillInvocation | null {
  const match = input.trim().match(SLASH_INVOCATION_RE);
  if (!match) return null;
  return { name: match[1], args: (match[2] ?? '').trim() };
}

/**
 * 若输入是对某个已启用技能的斜杠调用，返回注入技能全文后的 agent 内容；
 * 否则返回 null。只匹配会话显式启用的技能（与斜杠菜单展示范围一致），
 * 名字不在其中时不展开——留给 ACP 原生命令（/compact 等）处理。
 * If the input is a slash invocation of an enabled skill, return the agent
 * content with the full skill body injected; otherwise return null. Only
 * skills explicitly enabled on the conversation are matched (same set the
 * slash menu shows) — unknown names are left for ACP-native commands.
 */
export async function expandSlashSkillInvocation(
  input: string,
  enabledSkills?: string[]
): Promise<string | null> {
  const invocation = parseSlashInvocation(input);
  if (!invocation) return null;
  if (!enabledSkills?.includes(invocation.name)) return null;

  const skillManager = AcpSkillManager.getInstance(enabledSkills);
  await skillManager.discoverSkills(enabledSkills);
  if (!skillManager.hasSkill(invocation.name)) return null;

  const skill = await skillManager.getSkill(invocation.name);
  if (!skill?.body) return null;

  const request = invocation.args || `Use the "${skill.name}" skill for my current task.`;
  return `[Skill: ${skill.name}]\n${skill.body}\n\n[User Request]\n${request}`;
}
