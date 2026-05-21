/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProviderRepository } from './repository/AuthProviderRepository';

export type ResolvedSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function smtpFromEnv(): ResolvedSmtpConfig | null {
  const host = String(process.env.ONE_SMTP_HOST ?? '').trim();
  const portRaw = String(process.env.ONE_SMTP_PORT ?? '').trim();
  const user = String(process.env.ONE_SMTP_USER ?? '').trim();
  const pass = String(process.env.ONE_SMTP_PASS ?? '').trim();
  const from = String(process.env.ONE_SMTP_FROM ?? '').trim();
  if (!host || !portRaw || !user || !pass || !from) return null;
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) return null;
  const secure =
    String(process.env.ONE_SMTP_SECURE ?? '').trim().toLowerCase() === 'true' || port === 465;
  return { host, port, secure, user, pass, from };
}

export function resolvedSmtpFromConfig(cfg: Record<string, unknown>): ResolvedSmtpConfig | null {
  const host = String(cfg.host ?? '').trim();
  const portRaw = String(cfg.port ?? '').trim();
  const user = String(cfg.user ?? '').trim();
  const pass = String(cfg.pass ?? '').trim();
  const from = String(cfg.from ?? '').trim();
  if (!host || !portRaw || !user || !pass || !from) return null;
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) return null;
  const secure =
    cfg.secure === true ||
    String(cfg.secure ?? '').trim().toLowerCase() === 'true' ||
    port === 465;
  return { host, port, secure, user, pass, from };
}

/** DB provider `smtp` (when enabled) overrides `ONE_SMTP_*` environment variables. */
export async function resolveSmtpConfig(): Promise<ResolvedSmtpConfig | null> {
  try {
    const row = await AuthProviderRepository.getProvider('smtp');
    if (row?.enabled) {
      const fromDb = resolvedSmtpFromConfig(row.config);
      if (fromDb) return fromDb;
    }
  } catch {
    // fall through to env
  }
  return smtpFromEnv();
}
