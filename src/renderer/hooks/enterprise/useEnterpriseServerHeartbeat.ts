/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';

export type ServerHeartbeatStatus = 'idle' | 'checking' | 'online' | 'offline';

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;

/**
 * Poll a remote enterprise server's reachability while this machine is a client.
 * Pass the normalized server origin, or null to disable (server mode / no address).
 * Uses a no-cors probe — we only care whether the host responds, not the body.
 */
export function useEnterpriseServerHeartbeat(origin: string | null): ServerHeartbeatStatus {
  const [status, setStatus] = useState<ServerHeartbeatStatus>('idle');
  const originRef = useRef(origin);
  originRef.current = origin;

  useEffect(() => {
    if (!origin) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    const check = async () => {
      if (cancelled || originRef.current !== origin) {
        return;
      }
      setStatus((prev) => (prev === 'idle' ? 'checking' : prev));
      try {
        await fetch(`${origin}/api/auth/login-ui`, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
        });
        if (!cancelled && originRef.current === origin) {
          setStatus('online');
        }
      } catch {
        if (!cancelled && originRef.current === origin) {
          setStatus('offline');
        }
      }
    };
    void check();
    const timer = setInterval(() => void check(), HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [origin]);

  return status;
}
