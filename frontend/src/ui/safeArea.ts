/** Gap kept between a floating popup and the screen edge, in px. */
const EDGE_GAP = 8;

/** Collision padding per side, as Base UI positioners take it. */
export interface CollisionPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let cached: CollisionPadding | null = null;

/** Measures the safe-area insets, which CSS exposes only through `env()`. */
function measure(): CollisionPadding {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const inset = (value: string) => EDGE_GAP + (Number.parseFloat(value) || 0);
  const padding = {
    top: inset(style.paddingTop),
    right: inset(style.paddingRight),
    bottom: inset(style.paddingBottom),
    left: inset(style.paddingLeft),
  };
  probe.remove();
  return padding;
}

if (typeof window !== "undefined") {
  // Rotating the phone moves the notch and the bars.
  window.addEventListener("resize", () => {
    cached = null;
  });
}

/**
 * Collision padding that keeps popups clear of the screen edge and, on a
 * phone, of the status bar and the gesture bar (the safe-area insets).
 */
export function safeCollisionPadding(): CollisionPadding {
  cached ??= measure();
  return cached;
}
