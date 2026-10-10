/** Things a click can land on that are not "empty space" in a view. */
const CONTENT = [
  "a",
  "button",
  "input",
  "label",
  "li",
  "select",
  "textarea",
  "[contenteditable]",
  "[role='button']",
  "[role='checkbox']",
  "[role='dialog']",
  "[role='menu']",
  "[role='menuitem']",
  "[role='option']",
  "[role='textbox']",
].join(", ");

/**
 * True when a click inside `container` landed on empty space: not on a row,
 * control or field, not in a portal (whose React events still bubble), and
 * not the end of a text selection.
 */
export function isBackgroundClick(target: EventTarget, container: HTMLElement): boolean {
  if (!(target instanceof Element) || !container.contains(target)) return false;
  const selection = window.getSelection();
  if (selection !== null && !selection.isCollapsed) return false;
  const hit = target.closest(CONTENT);
  return hit === null || !container.contains(hit);
}
