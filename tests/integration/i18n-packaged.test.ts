import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  getAsarEntries,
  listFilesRecursive,
  resolveDefaultAppAsarPath,
  toPosixPath,
} from './asarTestUtils';

const repoRoot = path.resolve(__dirname, '../..');

function getExpectedRendererFiles(): string[] {
  const rendererDir = path.resolve(repoRoot, 'out/renderer');
  if (!fs.existsSync(rendererDir)) {
    throw new Error(`Renderer output directory not found: ${rendererDir}`);
  }

  return listFilesRecursive(rendererDir)
    .map((file) => toPosixPath(path.relative(repoRoot, file)))
    .filter((file) => !file.endsWith('.map'));
}

describe('Packaged i18n build integrity', () => {
  const envAsar = process.env.APP_ASAR_PATH;
  const resolvedEnvAsar = envAsar ? path.resolve(envAsar) : null;

  if (resolvedEnvAsar && !fs.existsSync(resolvedEnvAsar)) {
    throw new Error(`APP_ASAR_PATH does not exist: ${resolvedEnvAsar}`);
  }

  const appAsarPath = resolvedEnvAsar || resolveDefaultAppAsarPath(repoRoot);
  const rendererDir = path.resolve(repoRoot, 'out/renderer');
  const hasRendererDir = fs.existsSync(rendererDir);
  const runOrSkip = appAsarPath && hasRendererDir ? it : it.skip;

  runOrSkip('should include all renderer build files in app.asar', () => {
    const expectedFiles = getExpectedRendererFiles();
    const asarEntries = getAsarEntries(appAsarPath as string);

    const missing = expectedFiles.filter((file) => !asarEntries.has(file));

    expect(missing).toEqual([]);
  });
});
