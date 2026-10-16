/**
 * The phone's back gesture (Android's edge swipe or back button). The app
 * calls `window.planboxBack()` first: it closes whatever sits on top (a
 * menu, dialog or the navigation sheet, then a registered handler such as
 * the rail pane) and reports whether it did. Only when nothing was open does
 * the app go back a page in the WebView's history.
 */
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    /** Called by the Android app on a back gesture; true when handled here. */
    planboxBack?: () => boolean;
  }
}

/** Open Base UI popups that Escape closes, in document order (topmost last). */
const POPUPS = ['[role="dialog"]', '[role="alertdialog"]', '[role="menu"]', '[role="listbox"]']
  .map((role) => `${role}[data-open]`)
  .join(",");

const handlers: (() => void)[] = [];

/**
 * Closes the topmost open layer, as Escape would on a keyboard.
 *
 * @returns True when something was closed; false when the back gesture
 *   should go back a page instead.
 */
export function handleBack(doc: Document = document): boolean {
  if (doc.querySelector(POPUPS) !== null) {
    // Base UI closes the topmost popup on Escape and keeps focus inside it.
    const target = doc.activeElement ?? doc.body;
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
    );
    return true;
  }
  const handler = handlers.at(-1);
  if (handler === undefined) return false;
  handler();
  return true;
}

/**
 * While `onBack` is non-null, a back gesture calls it instead of going back
 * a page (after any open popup has been closed). The latest registration
 * wins.
 */
export function useBackHandler(onBack: (() => void) | null): void {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  const active = onBack !== null;
  useEffect(() => {
    if (!active) return undefined;
    const handler = () => {
      latest.current?.();
    };
    handlers.push(handler);
    return () => {
      handlers.splice(handlers.indexOf(handler), 1);
    };
  }, [active]);
}

/** Exposes {@link handleBack} to the Android app as `window.planboxBack`. */
export function installBackHandler(): void {
  window.planboxBack = () => handleBack();
}
