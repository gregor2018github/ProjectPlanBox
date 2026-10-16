/**
 * The device backend's time source. Only this file reads the system clock;
 * everything else receives a `Clock`, so tests control time.
 */
import { toIso } from "./time";

/** A source of the current instant (UTC milliseconds). */
export interface Clock {
  now(): number;
}

/** The real clock. */
export const systemClock: Clock = { now: () => Date.now() };

/** A manually advanced clock for tests. */
export class FixedClock implements Clock {
  constructor(private ms: number) {}

  now(): number {
    return this.ms;
  }

  /** Moves the clock forward. */
  advance(ms: number): void {
    this.ms += ms;
  }
}

/** The clock's current instant in PlanBox's fixed-width form (`utc_now_iso`). */
export function nowIso(clock: Clock): string {
  return toIso(clock.now());
}
