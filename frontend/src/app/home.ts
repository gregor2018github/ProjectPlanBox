/** Helpers of the Home page. */
import type { ModuleManifest } from "../core/module";

/** "Good morning" and friends, by the hour in the configured zone. */
export function greeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** The hour of day (0–23) now in `timeZone`. */
export function hourIn(timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone })
    .formatToParts(new Date())
    .find((part) => part.type === "hour")?.value;
  return Number(hour ?? 12);
}

/** Modules with a Home card: by `homeOrder`, the rest after them in sidebar order. */
export function homeSections(modules: readonly ModuleManifest[]): ModuleManifest[] {
  return modules
    .filter((m) => m.HomeSection !== undefined)
    .map((m, index) => ({ m, index }))
    .sort((a, b) => (a.m.homeOrder ?? Infinity) - (b.m.homeOrder ?? Infinity) || a.index - b.index)
    .map(({ m }) => m);
}
