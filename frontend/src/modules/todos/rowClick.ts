/** Click handling shared by the todo rows. */

/**
 * True when a click belongs to something other than the row itself: one of
 * its controls (checkbox, ⋯ menu, subtask toggle) or a portalled menu, whose
 * React events still bubble up here.
 */
export function isOwnControl(target: EventTarget, row: HTMLElement): boolean {
  if (!(target instanceof Node) || !row.contains(target)) return true;
  const element = target instanceof Element ? target : target.parentElement;
  const control = element ? element.closest("button, a, input, [role='checkbox']") : null;
  return control !== null && control !== row;
}
