"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getState } from "./api";
import type { StateResponse } from "./types";

const POLL_INTERVAL_MS = 30_000;
const TICK_INTERVAL_MS = 1_000;

export interface AppState {
  /** Last successful `/api/state`; kept through later failures. */
  state: StateResponse | null;
  /** Error from the most recent attempt, cleared by the next success. */
  error: ApiError | null;
  /** True until the first attempt settles either way. */
  loading: boolean;
  /** Re-fetches now (deduplicated while one is in flight). Call after every mutation. */
  refresh: () => Promise<void>;
  /**
   * Whole seconds since `state` was received, advancing once per second and
   * resetting to 0 on every successful fetch — add it to `age_seconds`, or
   * subtract it from `next_refresh_in_seconds`, to keep server values ticking.
   */
  tick: number;
}

/**
 * Owns the client's copy of the app state: fetches `/api/state` on mount,
 * every 30 s, when the tab becomes visible again, and on demand via
 * `refresh()`. A 1 s local tick lets consumers advance ages and countdowns
 * between polls without extra requests.
 */
export function useAppState(): AppState {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const inFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const run = getState()
      .then(
        (next) => {
          setState(next);
          setError(null);
          setTick(0);
        },
        (err: unknown) => {
          setError(ApiError.from(err));
        },
      )
      .finally(() => {
        setLoading(false);
        inFlight.current = null;
      });
    inFlight.current = run;
    return run;
  }, []);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return { state, error, loading, refresh, tick };
}
