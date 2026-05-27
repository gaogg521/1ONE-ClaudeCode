/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getDatabase } from '@process/services/database';
import { resolveEnterpriseContext } from '@process/webserver/auth/enterpriseContext';
import { getConfigPath } from '@process/utils/utils';
import type { WorkspaceTeamMembership, WorkspaceUserProfile } from '@/common/types/workspaceProfile';

const AVATAR_DIR_NAME = 'user-avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function getAvatarDir(): string {
  return path.join(getConfigPath(), AVATAR_DIR_NAME);
}

function mimeToExt(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  return '.jpg';
}

export function buildAvatarPublicPath(updatedAt: number): string {
  return `/api/auth/profile/avatar?ts=${updatedAt}`;
}

async function listUserTeams(tenantId: string, userId: string): Promise<WorkspaceTeamMembership[]> {
  const db = await getDatabase();
  const rows = db
    .getDriver()
    .prepare(
      `SELECT t.id as team_id, t.name as team_name, m.role
       FROM team_memberships m
       JOIN teams t ON t.id = m.team_id AND t.tenant_id = m.tenant_id
       WHERE m.tenant_id = ? AND m.user_id = ?
       ORDER BY t.name ASC`
    )
    .all(tenantId, userId) as Array<{ team_id: string; team_name: string; role: string }>;

  return rows.map((row) => ({
    teamId: row.team_id,
    teamName: row.team_name,
    role: row.role,
  }));
}

export async function getWorkspaceUserProfile(userId: string): Promise<WorkspaceUserProfile | null> {
  const db = await getDatabase();
  const row = db.getDriver().prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as
    | {
        id: string;
        username: string;
        email: string | null;
        role: string;
        tenant_id: string;
        avatar_path: string | null;
        updated_at: number;
      }
    | undefined;

  if (!row) {
    return null;
  }

  const tenantId = row.tenant_id ?? 'default';
  const enterprise = await resolveEnterpriseContext(tenantId);
  const teams = enterprise.joined ? await listUserTeams(tenantId, userId) : [];

  let avatarUrl: string | null = null;
  if (row.avatar_path) {
    try {
      await fs.access(row.avatar_path);
      avatarUrl = buildAvatarPublicPath(row.updated_at);
    } catch {
      avatarUrl = null;
    }
  }

  return {
    userId: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    tenantId: enterprise.tenantId,
    tenantName: enterprise.tenantName,
    joinedEnterprise: enterprise.joined,
    avatarUrl,
    teams,
    updatedAt: row.updated_at,
  };
}

export async function resolveUserAvatarFile(userId: string): Promise<{ filePath: string; mime: string } | null> {
  const db = await getDatabase();
  const row = db.getDriver().prepare(`SELECT avatar_path FROM users WHERE id = ?`).get(userId) as
    | { avatar_path: string | null }
    | undefined;
  if (!row?.avatar_path) {
    return null;
  }
  try {
    await fs.access(row.avatar_path);
  } catch {
    return null;
  }
  const ext = path.extname(row.avatar_path).toLowerCase();
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
  return { filePath: row.avatar_path, mime };
}

export async function updateUserAvatar(input: {
  userId: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<WorkspaceUserProfile> {
  if (!ALLOWED_MIME.has(input.mimeType)) {
    throw new Error('Unsupported avatar format');
  }
  if (input.buffer.length > MAX_AVATAR_BYTES) {
    throw new Error('Avatar file too large (max 2MB)');
  }

  const dir = getAvatarDir();
  await fs.mkdir(dir, { recursive: true });
  const ext = mimeToExt(input.mimeType);
  const filePath = path.join(dir, `${input.userId}${ext}`);
  await fs.writeFile(filePath, input.buffer);

  const db = await getDatabase();
  const now = Date.now();
  db.getDriver()
    .prepare(`UPDATE users SET avatar_path = ?, updated_at = ? WHERE id = ?`)
    .run(filePath, now, input.userId);

  const profile = await getWorkspaceUserProfile(input.userId);
  if (!profile) {
    throw new Error('User not found');
  }
  return profile;
}
