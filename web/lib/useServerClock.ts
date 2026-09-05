"use client";

import { useEffect, useRef, useState } from "react";

export interface ServerClock {
  /** Server-corrected epoch milliseconds: `Date.now()` shifted by the measured skew. */
  now(): number;
}

/**
 * Keeps a clock aligned with the API. Whenever a response's `server_now`
 * arrives, `offset = Date.parse(serverNow) - Date.now()` is recomputed; every
 * later `now()` call applies it, so countdowns run against the server's idea
 * of time rather than the device's. The server remains the only authority on
 * whether a quote is still valid.
 *
 * Returns a stable object so it can be passed as a prop without re-renders.
 */
export function useServerClock(serverNow?: string): ServerClock {
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!serverNow) return;
    const parsed = Date.parse(serverNow);
    if (!Number.isNaN(parsed)) offsetRef.current = parsed - Date.now();
  }, [serverNow]);

  const [clock] = useState<ServerClock>(() => ({
    now: () => Date.now() + offsetRef.current,
  }));

  return clock;
}
