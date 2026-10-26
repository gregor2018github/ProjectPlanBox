/** Token-backed classes for the pen colours (full names, so Tailwind finds them). */
import type { InkColor } from "../types";

/** The stroke colour of ink in each pen colour. */
export const inkClass: Record<InkColor, string> = {
  default: "stroke-ink-default",
  red: "stroke-ink-red",
  orange: "stroke-ink-orange",
  green: "stroke-ink-green",
  blue: "stroke-ink-blue",
  purple: "stroke-ink-purple",
};

/** The fill of a pen colour's swatch in the toolbar. */
export const inkSwatchClass: Record<InkColor, string> = {
  default: "bg-ink-default",
  red: "bg-ink-red",
  orange: "bg-ink-orange",
  green: "bg-ink-green",
  blue: "bg-ink-blue",
  purple: "bg-ink-purple",
};
