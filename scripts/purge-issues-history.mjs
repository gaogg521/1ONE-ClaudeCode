/**
 * Purge CTeam / Issues history (requirements + comments) from the local 1ONE SQLite DB.
 *
 * Usage:
 *   bun scripts/purge-issues-history.mjs
 *   bun scripts/purge-issues-history.mjs "C:\path\to\1one.db"
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Database } from 'bun:sqlite';

function resolveDefaultDbPath() {
  if (process.argv[2]) {
    return path.resolve(process.argv[2]);
  }
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, '1OneClaudeCode-Dev', '1one', '1one.db');
}

const dbPath = resolveDefaultDbPath();
if (!fs.existsSync(dbPath)) {
  console.error(`[purge-issues] Database not found: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);
const before = Number(db.query('SELECT COUNT(*) AS c FROM requirements').get()?.c ?? 0);
const commentsBefore = Number(db.query('SELECT COUNT(*) AS c FROM requirement_comments').get()?.c ?? 0);

db.run('BEGIN');
try {
  db.run('DELETE FROM requirement_comments');
  try {
    db.run('DELETE FROM value_stream_stages WHERE requirement_id IS NOT NULL');
  } catch {
    // optional table
  }
  db.run('DELETE FROM requirements');
  db.run('COMMIT');
} catch (error) {
  db.run('ROLLBACK');
  throw error;
} finally {
  db.close();
}

console.log(
  `[purge-issues] Cleared ${before} requirements and ${commentsBefore} comments from ${dbPath}`
);
