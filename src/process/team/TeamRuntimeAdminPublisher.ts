/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 *
 * C/S：主进程将本机运行时心跳同步到组织后台（与超级管理员 WebUI 同一 SQLite）。
 */

import { TEAM_RUNTIME_HEARTBEAT_PATH } from '@/common/teamRuntime/syncChannels';
import { mergeEnterpriseApiOrigins } from '@/common/config/enterpriseApiOrigins';
import type { TeamRuntimeNode, UpsertTeamRuntimeNodeInput } from '@/common/types/teamRuntimeTypes';
import { getWebServerInstance } from '@process/bridge/webuiBridge';
import { WebuiService } from '@process/bridge/services/WebuiService';
import { ProcessConfig } from '@process/utils/initStorage';
import { ONE_WEBUI_CLIENT_DESKTOP, ONE_WEBUI_CLIENT_HEADER } from '@/common/config/webuiClientHeaders';

async function readOrgApiOrigins(): Promise<string[]> {
  const stored =
    ((await ProcessConfig.get('webui.enterpriseApiOrigins').catch(() => [])) as string[] | undefined) ?? [];
  const local: string[] = [];
  const status = await WebuiService.getStatus(getWebServerInstance());
  if (status.port) {
    local.push(`http://127.0.0.1:${status.port}`);
    if (status.localUrl) {
      try {
        local.push(new URL(status.localUrl).origin);
      } catch {
        // ignore invalid url
      }
    }
    if (status.networkUrl) {
      try {
        local.push(new URL(status.networkUrl).origin);
      } catch {
        // ignore invalid url
      }
    }
  }
  return mergeEnterpriseApiOrigins(stored, local);
}

export async function publishTeamRuntimeToAdminBackend(
  payload: UpsertTeamRuntimeNodeInput
): Promise<TeamRuntimeNode | null> {
  const origins = await readOrgApiOrigins();
  if (origins.length === 0) {
    return null;
  }

  let bearer: string | undefined;
  try {
    const tokenResult = await WebuiService.getDesktopSessionToken();
    bearer = tokenResult.token;
  } catch {
    bearer = undefined;
  }

  let lastError: unknown = null;
  for (const origin of origins) {
    try {
      const response = await fetch(`${origin}${TEAM_RUNTIME_HEARTBEAT_PATH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          [ONE_WEBUI_CLIENT_HEADER]: ONE_WEBUI_CLIENT_DESKTOP,
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as {
        success?: boolean;
        data?: TeamRuntimeNode;
      } | null;
      if (response.ok && body?.data) {
        return body.data;
      }
      lastError = new Error(body ? JSON.stringify(body) : response.statusText);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn(
      '[TeamRuntimeAdminPublisher] sync failed:',
      lastError instanceof Error ? lastError.message : String(lastError)
    );
  }
  return null;
}
