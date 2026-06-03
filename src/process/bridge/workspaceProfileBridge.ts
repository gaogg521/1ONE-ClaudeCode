/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import { workspaceProfile } from '@/common/adapter/ipcBridge';
import {
  getWorkspaceUserProfile,
  resolveUserAvatarFile,
  updateUserAvatar,
} from '@process/services/user/userProfileService';
import { normalizeIpcBuffer } from '@process/utils/normalizeIpcBuffer';
import { WebuiService } from './services/WebuiService';

export function initWorkspaceProfileBridge(): void {
  workspaceProfile.get.provider(async () => {
    return WebuiService.handleAsync(async () => {
      const userId = await WebuiService.resolveWorkspaceProfileUserId();
      const profile = await getWorkspaceUserProfile(userId);
      if (!profile) {
        throw new Error('User not found');
      }
      return { success: true, data: profile };
    }, 'Get workspace profile');
  });

  workspaceProfile.uploadAvatar.provider(async ({ mimeType, data }) => {
    return WebuiService.handleAsync(async () => {
      const userId = await WebuiService.resolveWorkspaceProfileUserId();
      const profile = await updateUserAvatar({
        userId,
        buffer: normalizeIpcBuffer(data),
        mimeType,
      });
      return { success: true, data: profile };
    }, 'Upload workspace avatar');
  });

  workspaceProfile.readAvatarBuffer.provider(async () => {
    return WebuiService.handleAsync(async () => {
      const userId = await WebuiService.resolveWorkspaceProfileUserId();
      const resolved = await resolveUserAvatarFile(userId);
      if (!resolved) {
        throw new Error('Avatar not found');
      }
      const buffer = await fs.readFile(resolved.filePath);
      return {
        success: true,
        data: {
          mimeType: resolved.mime,
          base64: buffer.toString('base64'),
        },
      };
    }, 'Read workspace avatar');
  });
}
