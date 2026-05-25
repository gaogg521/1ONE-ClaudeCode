import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { setupCors } from '@process/webserver/setup';

const servers: Array<import('http').Server> = [];

async function startCorsApp(): Promise<{ serverUrl: string; close: () => Promise<void> }> {
  const app = express();
  setupCors(app, 25809, true);
  app.get('/api/auth/enterprise-context', (_req, res) => {
    res.json({ success: true });
  });

  const server = await new Promise<import('http').Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  servers.push(server);
  const { port } = server.address() as AddressInfo;

  return {
    serverUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (!server.listening) {
            resolve();
            return;
          }
          server.close(() => resolve());
        })
    )
  );
});

describe('setupCors', () => {
  it('allows Electron dev renderer origin to pass WebUI preflight requests', async () => {
    const { serverUrl } = await startCorsApp();

    const response = await fetch(`${serverUrl}/api/auth/enterprise-context`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });
});
