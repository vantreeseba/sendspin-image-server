import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(listener: () => void) {
  if (typeof window.matchMedia !== "function") {
    return () => {};
  }
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function read() {
  return typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

/** `true` when the reader's system asks for reduced motion, kept up to date as they change it. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
