"use client";

import { useSyncExternalStore } from "react";

/**
 * Tracks the viewer's `prefers-reduced-motion` setting.
 *
 * Motion in a money app is decoration, never information — every animated
 * value here is also readable as plain text. Components call this and skip
 * their transitions entirely when the viewer has asked for less movement,
 * rather than merely shortening them.
 *
 * `matchMedia` is an external store, so this subscribes to it rather than
 * mirroring it into state: the server snapshot is `true` (render the still
 * version first, never a frame of unwanted motion) and the client corrects
 * on hydration.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
