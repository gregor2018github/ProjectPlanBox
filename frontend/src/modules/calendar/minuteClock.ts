/**
 * One shared "now" for every event on screen, updated each minute, so past
 * events turn done while the calendar is open (one timer, however many
 * events subscribe).
 */
import { useSyncExternalStore } from "react";

let now = new Date().toISOString();
let timer: number | undefined;
const listeners = new Set<() => void>();

function tick(): void {
  now = new Date().toISOString();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === undefined) {
    now = new Date().toISOString();
    timer = window.setInterval(tick, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The current UTC instant (ISO), refreshed every minute. */
export function useMinuteClock(): string {
  return useSyncExternalStore(subscribe, () => now);
}
