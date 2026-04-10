/**
 * Memory Bridge — read/write Claude Code memory files
 * Supports: MEMORY.md entries, global CLAUDE.md, project CLAUDE.md
 *
 * Project-scoped paths use an explicit config key (memory.claudeProjectRoot) when set,
 * otherwise fall back to getSystemDir().workDir so they align with Settings → 工作目录.
 */
import { ipcBridge } from '@/common';
import type { MemoryFileEntry, MemoryScopeInfo } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { shell } from 'electron';
import { getSystemDir, ProcessConfig } from '@process/utils/initStorage';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';

function sanitizePathForClaude(p: string): string {
  // Claude Code stores project memory at ~/.claude/projects/{sanitized}/memory/
  return path.resolve(p).replace(/[:/\\]/g, '-');
}

function getWorkspaceFromConversation(c: TChatConversation): string | undefined {
  const w = (c.extra as { workspace?: string } | undefined)?.workspace;
  return typeof w === 'string' && w.trim() ? w.trim() : undefined;
}

async function resolveClaudeProjectRoot(): Promise<string> {
  const configured = await ProcessConfig.get('memory.claudeProjectRoot').catch((): undefined => undefined);
  const trimmed = typeof configured === 'string' ? configured.trim() : '';
  if (trimmed) {
    return path.resolve(trimmed);
  }
  return getSystemDir().workDir;
}

function normalizeRootInput(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  try {
    if (existsSync(resolved) && statSync(resolved).isFile()) {
      return path.dirname(resolved);
    }
  } catch {
    // ignore
  }
  return resolved;
}

function getMemoryDir(projectRoot: string): string {
  const sanitized = sanitizePathForClaude(projectRoot);
  return path.join(os.homedir(), '.claude', 'projects', sanitized, 'memory');
}

function getGlobalClaudePath(): string {
  return path.join(os.homedir(), '.claude', 'CLAUDE.md');
}

function resolveProjectClaudePaths(projectRoot: string): { readPath: string; exists: boolean } {
  const root = path.resolve(projectRoot);
  const dotClaudePath = path.join(root, '.claude', 'CLAUDE.md');
  const rootClaudePath = path.join(root, 'CLAUDE.md');
  if (existsSync(dotClaudePath)) {
    return { readPath: dotClaudePath, exists: true };
  }
  if (existsSync(rootClaudePath)) {
    return { readPath: rootClaudePath, exists: true };
  }
  return { readPath: dotClaudePath, exists: false };
}

function getNewProjectClaudePath(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), '.claude', 'CLAUDE.md');
}

function parseEntryName(filename: string, content: string): string {
  const match = content.match(/^name:\s*(.+?)$/m);
  if (match) return match[1].trim();
  return filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
}

async function buildScopeInfo(): Promise<MemoryScopeInfo> {
  const appWorkDir = getSystemDir().workDir;
  const configuredRaw = await ProcessConfig.get('memory.claudeProjectRoot').catch((): undefined => undefined);
  const configuredRoot =
    typeof configuredRaw === 'string' && configuredRaw.trim() ? path.resolve(configuredRaw.trim()) : null;
  const effectiveRoot = configuredRoot ?? appWorkDir;
  const { readPath, exists } = resolveProjectClaudePaths(effectiveRoot);
  return {
    effectiveRoot,
    configuredRoot,
    absoluteMemoryDir: getMemoryDir(effectiveRoot),
    projectClaudePath: readPath,
    projectClaudeExists: exists,
    globalClaudePath: getGlobalClaudePath(),
    appWorkDir,
  };
}

export function initMemoryBridge(conversationRepo: IConversationRepository): void {
  ipcBridge.memory.getScope.provider(async () => buildScopeInfo());

  ipcBridge.memory.setClaudeProjectRoot.provider(async ({ path: rootPath }) => {
    if (rootPath === null || !String(rootPath).trim()) {
      await ProcessConfig.remove('memory.claudeProjectRoot');
      return;
    }
    const resolved = normalizeRootInput(String(rootPath).trim());
    await ProcessConfig.set('memory.claudeProjectRoot', resolved);
  });

  ipcBridge.memory.suggestRoots.provider(async () => {
    const workDir = getSystemDir().workDir;
    const roots: string[] = [];
    const seen = new Set<string>();
    const add = (raw: string | undefined) => {
      if (!raw?.trim()) return;
      let r: string;
      try {
        r = path.resolve(raw.trim());
      } catch {
        return;
      }
      const key = r.replace(/[/\\]+$/, '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      roots.push(r);
    };

    try {
      const all = await conversationRepo.listAllConversations();
      const sorted = [...all].toSorted((a, b) => b.modifyTime - a.modifyTime);
      for (const c of sorted) {
        add(getWorkspaceFromConversation(c));
        if (roots.length >= 28) break;
      }
    } catch {
      /* ignore */
    }
    add(workDir);
    return roots;
  });

  ipcBridge.memory.list.provider(async () => {
    const projectRoot = await resolveClaudeProjectRoot();
    const dir = getMemoryDir(projectRoot);
    console.log('[Memory Bridge] memory dir:', dir);
    const fsp = await import('node:fs/promises');
    try {
      const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.md'));
      const settled = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(dir, file);
          try {
            const content = await fsp.readFile(filePath, 'utf-8');
            const stat = statSync(filePath);
            return {
              name: parseEntryName(file, content),
              filename: file,
              path: filePath,
              content,
              updatedAt: stat.mtimeMs,
            } satisfies MemoryFileEntry;
          } catch {
            return null;
          }
        })
      );
      return settled.filter((e): e is MemoryFileEntry => e !== null).toSorted((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  });

  ipcBridge.memory.read.provider(async ({ filename }) => {
    if (filename === 'global-claude') {
      const p = getGlobalClaudePath();
      return existsSync(p) ? readFileSync(p, 'utf-8') : '';
    }
    const projectRoot = await resolveClaudeProjectRoot();
    const filePath = path.join(getMemoryDir(projectRoot), path.basename(filename));
    try {
      return readFileSync(filePath, 'utf-8');
    } catch {
      return '';
    }
  });

  ipcBridge.memory.write.provider(async ({ filename, content }) => {
    if (filename === 'global-claude') {
      writeFileSync(getGlobalClaudePath(), content, 'utf-8');
      return;
    }
    const projectRoot = await resolveClaudeProjectRoot();
    const dir = getMemoryDir(projectRoot);
    mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, path.basename(filename));
    writeFileSync(filePath, content, 'utf-8');
  });

  ipcBridge.memory.delete.provider(async ({ filename }) => {
    const { unlinkSync } = await import('node:fs');
    const projectRoot = await resolveClaudeProjectRoot();
    const filePath = path.join(getMemoryDir(projectRoot), path.basename(filename));
    if (existsSync(filePath)) unlinkSync(filePath);
  });

  ipcBridge.memory.openInEditor.provider(async ({ filename }) => {
    let p: string;
    if (filename === 'global-claude') {
      p = getGlobalClaudePath();
    } else if (filename === 'project-claude') {
      const projectRoot = await resolveClaudeProjectRoot();
      const { readPath, exists } = resolveProjectClaudePaths(projectRoot);
      p = exists ? readPath : getNewProjectClaudePath(projectRoot);
    } else {
      const projectRoot = await resolveClaudeProjectRoot();
      p = path.join(getMemoryDir(projectRoot), path.basename(filename));
    }
    await shell.openPath(p);
  });

  ipcBridge.memory.projectClaude.provider(async () => {
    const projectRoot = await resolveClaudeProjectRoot();
    const { readPath, exists } = resolveProjectClaudePaths(projectRoot);
    return {
      exists,
      content: exists ? readFileSync(readPath, 'utf-8') : '',
      path: exists ? readPath : getNewProjectClaudePath(projectRoot),
    };
  });

  ipcBridge.memory.writeProjectClaude.provider(async ({ content }) => {
    const projectRoot = await resolveClaudeProjectRoot();
    const dot = path.join(projectRoot, '.claude', 'CLAUDE.md');
    const rootFile = path.join(projectRoot, 'CLAUDE.md');
    const target = existsSync(dot) ? dot : existsSync(rootFile) ? rootFile : dot;
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, 'utf-8');
  });
}
