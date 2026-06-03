/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 *
 * Run: npm run test -- tests/integration/issuesPersonalFlow.bun.test.ts
 */

import { registerPlatformServices } from '@/common/platform';
import { NodePlatformServices } from '@/common/platform/NodePlatformServices';

registerPlatformServices(new NodePlatformServices());

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@process/webserver/middleware/security', () => ({
  apiRateLimiter: (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RequestHandler } from 'express';
import express from 'express';
import { closeDatabase, getDatabase, __testOnlySetDatabasePath } from '@process/services/database';
import { DESKTOP_OPERATOR_USER_ID } from '@/common/auth/enterpriseRoles';
import { formatCreatorDisplayName } from '@/renderer/pages/issues/issueUtils';

function isBetterSqliteAvailable(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3');
    const probe = new BetterSqlite3(':memory:');
    probe.close();
    return true;
  } catch {
    return false;
  }
}

function createResponseMock() {
  const res = {
    json: vi.fn(() => undefined),
    status: vi.fn(() => res),
    setHeader: vi.fn(() => res),
    headersSent: false,
  };
  return res;
}

function createDesktopReq(partial: Record<string, unknown> = {}): express.Request {
  return {
    headers: { host: '127.0.0.1:25809', 'x-one-client': 'electron-desktop' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    app: { get: () => false },
    ...partial,
  } as express.Request;
}

function createBrowserLocalReq(partial: Record<string, unknown> = {}): express.Request {
  return {
    headers: { host: '127.0.0.1:25809' },
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    app: { get: () => false },
    ...partial,
  } as express.Request;
}

async function runRouteStack(
  app: express.Express,
  method: string,
  routePath: string,
  req: express.Request,
  res: ReturnType<typeof createResponseMock>
): Promise<void> {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; methods?: Record<string, boolean> } }) =>
      entry.route?.path === routePath && entry.route?.methods?.[method]
  );
  const stack = layer?.route?.stack as Array<{ handle: RequestHandler }> | undefined;
  if (!stack) {
    throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`);
  }
  const dispatch = async (index: number): Promise<void> => {
    const entry = stack[index];
    if (!entry) {
      return;
    }
    let nextCalled = false;
    await entry.handle(req, res, (error?: unknown) => {
      nextCalled = true;
      if (error) {
        throw error;
      }
    });
    if (nextCalled) {
      await dispatch(index + 1);
    }
  };
  await dispatch(0);
}

const describeIntegration = isBetterSqliteAvailable() ? describe : describe.skip;

describeIntegration('Issues personal desktop flow (integration)', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-issues-flow-'));
  const dbPath = path.join(tempDir, '1one.db');
  let app: express.Express;

  beforeEach(async () => {
    __testOnlySetDatabasePath(dbPath);
    const db = await getDatabase();
    const driver = db.getDriver();
    driver.exec('DELETE FROM requirement_comments');
    driver.exec('DELETE FROM requirements');

    app = express();
    app.use(express.json());
    const { registerDevOpsRoutes } = await import('@process/webserver/routes/devopsRoutes');
    registerDevOpsRoutes(app);
  });

  afterEach(() => {
    closeDatabase();
    __testOnlySetDatabasePath(null);
  });

  afterAll(() => {
    closeDatabase();
    __testOnlySetDatabasePath(null);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EBUSY' && code !== 'EPERM') {
        throw error;
      }
    }
  });

  it('creates, lists, and comments on a personal Issue with readable creator names', async () => {
    const createReq = createDesktopReq({
      body: {
        type: 'story',
        subject: 'P0 个人版验证 Issue',
        description: 'integration flow',
        priority: 'medium',
      },
    });
    const createRes = createResponseMock();
    await runRouteStack(app, 'post', '/api/admin/requirements', createReq, createRes);

    const createPayload = createRes.json.mock.calls[0]?.[0] as { success: boolean; data: { id: string } };
    expect(createPayload.success).toBe(true);
    const createdId = createPayload.data.id;

    const treeReq = createDesktopReq();
    const treeRes = createResponseMock();
    await runRouteStack(app, 'get', '/api/admin/requirements/tree', treeReq, treeRes);

    const treeBody = treeRes.json.mock.calls[0]?.[0] as {
      success: boolean;
      data: Array<Record<string, unknown>>;
    };
    const walk = (nodes: Array<Record<string, unknown>>): Array<Record<string, unknown>> =>
      nodes.flatMap((node) => [
        node,
        ...walk((node.children as Array<Record<string, unknown>> | undefined) ?? []),
      ]);
    const created = walk(treeBody.data).find((row) => row.id === createdId);
    expect(created?.creator_id).toBe(DESKTOP_OPERATOR_USER_ID);
    expect(created?.creator_name).toBe('本地用户');
    expect(formatCreatorDisplayName(created as { creator_id: string; creator_name?: string }, null)).toBe(
      '本地用户'
    );

    const commentReq = createDesktopReq({
      params: { id: createdId },
      body: { body: 'P0 集成测试评论' },
    });
    const commentRes = createResponseMock();
    await runRouteStack(
      app,
      'post',
      '/api/admin/requirements/:id/comments',
      commentReq,
      commentRes
    );
    const commentPayload = commentRes.json.mock.calls[0]?.[0] as { success: boolean };
    expect(commentPayload.success).toBe(true);

    const listCommentsReq = createDesktopReq({
      params: { id: createdId },
    });
    const listCommentsRes = createResponseMock();
    await runRouteStack(
      app,
      'get',
      '/api/admin/requirements/:id/comments',
      listCommentsReq,
      listCommentsRes
    );
    const commentRows = listCommentsRes.json.mock.calls[0]?.[0] as Array<{ author_name: string }>;
    expect(commentRows).toHaveLength(1);
    expect(commentRows[0]?.author_name).toBe('本地用户');
  });

  it('allows loopback browser WebUI guest to create a personal Issue without desktop client header', async () => {
    const createReq = createBrowserLocalReq({
      body: {
        type: 'story',
        subject: 'Browser guest issue',
        description: 'personal',
        priority: 'low',
      },
    });
    const createRes = createResponseMock();
    await runRouteStack(app, 'post', '/api/admin/requirements', createReq, createRes);
    const createPayload = createRes.json.mock.calls[0]?.[0] as { success: boolean; data: { id: string } };
    expect(createPayload.success).toBe(true);
  });
});
