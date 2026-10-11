import { cx } from "./cx";
import { tintProps } from "./tint";

/** Props for {@link TintDot}. */
export interface TintDotProps {
  /** 0–359 OKLCH degrees. */
  hue: number;
  size?: "sm" | "md";
}

/** A small decorative dot in a tint's accent (e.g. an area's colour). */
export function TintDot({ hue, size = "sm" }: TintDotProps) {
  return (
    <span
      {...tintProps(hue)}
      aria-hidden
      className={cx(
        "inline-block shrink-0 rounded-full bg-accent transition-colors duration-(--duration-base) ease-out",
        size === "sm" ? "size-2" : "size-3",
      )}
    />
  );
}
