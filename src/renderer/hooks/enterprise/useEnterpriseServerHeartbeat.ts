/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';

export type ServerHeartbeatStatus = 'idle' | 'checking' | 'online' | 'offline';

export type ServerConnectionEvent = {
  type: 'connected' | 'disconnected';
  time: number;
};

export type ServerHeartbeatResult = {
  status: ServerHeartbeatStatus;
  events: ServerConnectionEvent[];
};

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;
const MAX_EVENTS = 20;

/**
 * Poll a remote enterprise server's reachability while this machine is a client.
 * Pass the normalized server origin, or null to disable (server mode / no address).
 * Uses a no-cors probe — we only care whether the host responds, not the body.
 * Returns both the current status and a history of connection/disconnection events.
 */
export function useEnterpriseServerHeartbeat(origin: string | null): ServerHeartbeatResult {
  const [status, setStatus] = useState<ServerHeartbeatStatus>('idle');
  const [events, setEvents] = useState<ServerConnectionEvent[]>([]);
  const originRef = useRef(origin);
  originRef.current = origin;
  const prevStatusRef = useRef<ServerHeartbeatStatus>('idle');

  useEffect(() => {
    if (!origin) {
      setStatus('idle');
      setEvents([]);
      prevStatusRef.current = 'idle';
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
          if (prevStatusRef.current !== 'online') {
            prevStatusRef.current = 'online';
            setEvents((prev) => [
              { type: 'connected', time: Date.now() },
              ...prev.slice(0, MAX_EVENTS - 1),
            ]);
          }
        }
      } catch {
        if (!cancelled && originRef.current === origin) {
          setStatus('offline');
          if (prevStatusRef.current === 'online') {
            prevStatusRef.current = 'offline';
            setEvents((prev) => [
              { type: 'disconnected', time: Date.now() },
              ...prev.slice(0, MAX_EVENTS - 1),
            ]);
          } else {
            prevStatusRef.current = 'offline';
          }
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

  return { status, events };
}
