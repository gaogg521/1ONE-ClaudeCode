/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Express, Request, Response } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import multer from 'multer';
import fs from 'node:fs/promises';
import {
  getWorkspaceUserProfile,
  resolveUserAvatarFile,
  updateUserAvatar,
} from '@process/services/user/userProfileService';
import { registerBrowserSessionFromRequest } from '@process/webserver/auth/registerBrowserWebuiLoginSession';
import { logRouteError } from '../webuiLog';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

type RegisterProfileRoutesOptions = {
  rateLimit: RateLimitRequestHandler;
  auth: (req: Request, res: Response, next: () => void) => void;
};

export function registerProfileRoutes(app: Express, opts: RegisterProfileRoutesOptions): void {
  const { rateLimit, auth } = opts;

  app.get('/api/auth/workspace-profile', rateLimit, auth, async (req, res) => {
    try {
      const profile = await getWorkspaceUserProfile(req.user!.id);
      if (!profile) {
        res.status(404).json({ success: false, message: 'User not found' });
        return;
      }
      registerBrowserSessionFromRequest(req, {
        id: profile.userId,
        username: profile.username,
        role: profile.role,
      });
      res.json({ success: true, data: profile });
    } catch (error) {
      logRouteError('[ProfileRoute] workspace-profile error', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  app.get('/api/auth/profile/avatar', rateLimit, auth, async (req, res) => {
    try {
      const resolved = await resolveUserAvatarFile(req.user!.id);
      if (!resolved) {
        res.status(404).end();
        return;
      }
      res.setHeader('Content-Type', resolved.mime);
      res.setHeader('Cache-Control', 'private, max-age=300');
      const buffer = await fs.readFile(resolved.filePath);
      res.send(buffer);
    } catch (error) {
      logRouteError('[ProfileRoute] avatar read error', error);
      res.status(500).end();
    }
  });

  app.post('/api/auth/profile/avatar', rateLimit, auth, avatarUpload.single('avatar'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'Avatar file is required' });
        return;
      }
      const profile = await updateUserAvatar({
        userId: req.user!.id,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });
      res.json({ success: true, data: profile });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update avatar';
      logRouteError('[ProfileRoute] avatar upload error', error);
      res.status(400).json({ success: false, message });
    }
  });
}
