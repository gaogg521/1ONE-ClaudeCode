/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 *
 * C/S（桌面 Electron）与 B/S（浏览器 WebUI）共用同一套组织后台 API：
 * - POST /api/team-runtime/heartbeat  上报本机/本会话运行时
 * - GET  /api/team-runtime/nodes        成员拉取（可按 team 过滤）
 * - GET  /api/admin/team-runtime/nodes  管理员后台拉取全租户
 */

export type TeamRuntimeClientChannel = 'desktop' | 'browser';

export const TEAM_RUNTIME_HEARTBEAT_PATH = '/api/team-runtime/heartbeat';
export const TEAM_RUNTIME_NODES_PATH = '/api/team-runtime/nodes';
export const ADMIN_TEAM_RUNTIME_NODES_PATH = '/api/admin/team-runtime/nodes';
