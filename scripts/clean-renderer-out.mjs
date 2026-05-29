/**
 * Remove out/renderer before a WebUI build so hashed assets cannot drift from index.html.
 * @license Apache-2.0
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out', 'renderer');

try {
  fs.rmSync(target, { recursive: true, force: true });
  console.log('[clean-renderer-out] Removed', target);
} catch (error) {
  console.warn('[clean-renderer-out] Failed:', error);
  process.exitCode = 1;
}
