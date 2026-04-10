/**
 * Hooks Bridge — read/write Claude Code hooks from ~/.claude/settings.json
 * Stores full list (with enabled state) under `_1one_hooks` key,
 * syncs enabled hooks to standard `hooks` key for Claude Code to consume.
 */
import { ipcBridge } from '@/common';
import type { HookEntry } from '@/common/adapter/ipcBridge';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function getSettingsPath(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function readSettings(): Record<string, unknown> {
  const p = getSettingsPath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function writeSettings(data: Record<string, unknown>): void {
  writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8');
}

/** Build Claude settings.json hooks structure from enabled HookEntry[] */
function buildHooksObj(entries: HookEntry[]): Record<string, unknown[]> {
  const enabled = entries.filter((e) => e.enabled);
  const byEvent: Record<string, Map<string, string[]>> = {};
  for (const e of enabled) {
    if (!byEvent[e.event]) byEvent[e.event] = new Map();
    const key = e.matcher ?? '';
    const cmds = byEvent[e.event].get(key) ?? [];
    cmds.push(e.command);
    byEvent[e.event].set(key, cmds);
  }
  const result: Record<string, unknown[]> = {};
  for (const [event, matcherMap] of Object.entries(byEvent)) {
    result[event] = [];
    for (const [matcher, commands] of matcherMap.entries()) {
      const group: Record<string, unknown> = {
        hooks: commands.map((cmd) => ({ type: 'command', command: cmd })),
      };
      if (matcher) group['matcher'] = matcher;
      result[event].push(group);
    }
  }
  return result;
}

/** Import existing hooks from standard `hooks` key (first-time load) */
function importFromClaudeHooks(settings: Record<string, unknown>): HookEntry[] {
  const rawHooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  if (!rawHooks) return [];
  const entries: HookEntry[] = [];
  for (const [event, eventHooks] of Object.entries(rawHooks)) {
    if (!Array.isArray(eventHooks)) continue;
    for (const group of eventHooks) {
      const g = group as { matcher?: string; hooks?: Array<{ type?: string; command?: string }> };
      for (const h of g.hooks ?? []) {
        if (!h.command) continue;
        entries.push({
          id: `${event}:${g.matcher ?? ''}:${h.command}`,
          event,
          matcher: g.matcher,
          command: h.command,
          scope: 'user',
          enabled: true,
        });
      }
    }
  }
  return entries;
}

export function initHooksBridge(): void {
  ipcBridge.hooks.list.provider(async () => {
    const settings = readSettings();
    // Use _1one_hooks if present, otherwise import from standard hooks
    const stored = settings['_1one_hooks'] as HookEntry[] | undefined;
    if (stored && Array.isArray(stored)) return stored;
    return importFromClaudeHooks(settings);
  });

  ipcBridge.hooks.save.provider(async ({ entries }) => {
    const settings = readSettings();
    settings['_1one_hooks'] = entries;
    settings['hooks'] = buildHooksObj(entries);
    writeSettings(settings);
  });
}
