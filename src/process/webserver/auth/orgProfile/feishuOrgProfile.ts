/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

const FEISHU_HTTP_TIMEOUT_MS = 12_000;

type FeishuApiResponse<T> = { code: number; msg?: string; data?: T };

function asFeishuResponse<T>(value: unknown): FeishuApiResponse<T> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.code !== 'number') {
    return null;
  }
  return obj as FeishuApiResponse<T>;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = FEISHU_HTTP_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Feishu request timeout after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchFeishuTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const res = await fetchWithTimeout('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = (await res.json().catch((): null => null)) as unknown;
  const obj = asFeishuResponse<{ tenant_access_token?: string }>(data);
  if (!res.ok || !obj || obj.code !== 0) {
    throw new Error(obj?.msg || `Feishu tenant token failed: HTTP ${res.status}`);
  }
  const token = obj.data?.tenant_access_token;
  if (!token) {
    throw new Error('Feishu tenant token missing');
  }
  return token;
}

type FeishuContactUser = {
  department_ids?: string[];
};

type FeishuDepartment = {
  name?: string;
  parent_department_id?: string;
};

async function fetchFeishuContactUser(openId: string, tenantToken: string): Promise<FeishuContactUser | null> {
  const url = new URL(`https://open.feishu.cn/open-apis/contact/v3/users/${encodeURIComponent(openId)}`);
  url.searchParams.set('user_id_type', 'open_id');
  url.searchParams.set('department_id_type', 'open_department_id');

  const res = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${tenantToken}` },
  });
  const data = (await res.json().catch((): null => null)) as unknown;
  const obj = asFeishuResponse<{ user?: FeishuContactUser }>(data);
  if (!res.ok || !obj || obj.code !== 0) {
    return null;
  }
  return obj.data?.user ?? null;
}

async function fetchFeishuDepartment(departmentId: string, tenantToken: string): Promise<FeishuDepartment | null> {
  const url = new URL(`https://open.feishu.cn/open-apis/contact/v3/departments/${encodeURIComponent(departmentId)}`);
  url.searchParams.set('department_id_type', 'open_department_id');

  const res = await fetchWithTimeout(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${tenantToken}` },
  });
  const data = (await res.json().catch((): null => null)) as unknown;
  const obj = asFeishuResponse<{ department?: FeishuDepartment }>(data);
  if (!res.ok || !obj || obj.code !== 0) {
    return null;
  }
  return obj.data?.department ?? null;
}

async function buildFeishuDepartmentPath(departmentId: string, tenantToken: string): Promise<string | null> {
  const names: string[] = [];
  let currentId = departmentId.trim();
  const seen = new Set<string>();

  for (let depth = 0; depth < 12 && currentId; depth += 1) {
    if (seen.has(currentId)) {
      break;
    }
    seen.add(currentId);

    const dept = await fetchFeishuDepartment(currentId, tenantToken);
    if (!dept?.name?.trim()) {
      break;
    }
    names.unshift(dept.name.trim());

    const parentId = String(dept.parent_department_id ?? '').trim();
    if (!parentId || parentId === '0') {
      break;
    }
    currentId = parentId;
  }

  return names.length > 0 ? names.join(' / ') : null;
}

export async function fetchFeishuOrgUnitPath(input: {
  appId: string;
  appSecret: string;
  openId: string;
}): Promise<string | null> {
  const openId = input.openId.trim();
  if (!openId) {
    return null;
  }

  const tenantToken = await fetchFeishuTenantAccessToken(input.appId, input.appSecret);
  const user = await fetchFeishuContactUser(openId, tenantToken);
  const departmentIds = user?.department_ids?.filter((id) => typeof id === 'string' && id.trim()) ?? [];
  if (departmentIds.length === 0) {
    return null;
  }

  const paths: string[] = [];
  for (const departmentId of departmentIds.slice(0, 3)) {
    const path = await buildFeishuDepartmentPath(departmentId, tenantToken);
    if (path) {
      paths.push(path);
    }
  }

  return paths.length > 0 ? paths.join('；') : null;
}
