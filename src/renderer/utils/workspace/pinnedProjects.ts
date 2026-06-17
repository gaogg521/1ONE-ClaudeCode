const PINNED_PROJECTS_STORAGE_KEY = 'workspace:pinned-projects';

function normalizeProjectPath(path: string): string {
  return path.trim().replace(/[\\/]+$/, '');
}

export function readPinnedProjects(): string[] {
  try {
    const raw = window.localStorage.getItem(PINNED_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeProjectPath)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function writePinnedProjects(paths: string[]): void {
  const normalized = [...new Set(paths.map(normalizeProjectPath).filter(Boolean))];
  window.localStorage.setItem(PINNED_PROJECTS_STORAGE_KEY, JSON.stringify(normalized));
}

export function addPinnedProject(path: string): string[] {
  const normalized = normalizeProjectPath(path);
  if (!normalized) return readPinnedProjects();
  const next = [...new Set([...readPinnedProjects(), normalized])];
  writePinnedProjects(next);
  return next;
}

export function removePinnedProject(path: string): string[] {
  const normalized = normalizeProjectPath(path);
  const next = readPinnedProjects().filter((item) => item !== normalized);
  writePinnedProjects(next);
  return next;
}

export function getProjectDisplayName(path: string): string {
  const normalized = normalizeProjectPath(path);
  if (!normalized) return path;
  return normalized.split(/[\\/]/).filter(Boolean).pop() ?? normalized;
}
