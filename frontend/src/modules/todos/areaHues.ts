/**
 * Default area hues (OKLCH degrees), well apart. Mirrors `AREA_HUES` in the
 * backend's `todos/service.py` and migration `todos/0005`; the client sends
 * the hue with a create so the optimistic row has its colour at once.
 */
export const AREA_HUES: readonly number[] = [264, 155, 30, 210, 310, 80, 350, 185];

/** The first default hue no live area uses, else cycles by area count. */
export function nextAreaHue(taken: readonly number[]): number {
  const used = new Set(taken);
  return (
    AREA_HUES.find((h) => !used.has(h)) ?? (AREA_HUES[taken.length % AREA_HUES.length] as number)
  );
}
