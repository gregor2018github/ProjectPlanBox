import { Flame } from "lucide-react";

import { cx } from "../../../ui/cx";

/** Props for {@link StreakBadge}. */
export interface StreakBadgeProps {
  streak: number;
}

/** The current streak as a flame and a number (muted at zero). */
export function StreakBadge({ streak }: StreakBadgeProps) {
  return (
    <span
      aria-label={`Current streak: ${streak}`}
      className={cx(
        "inline-flex shrink-0 items-center gap-1 text-sm tabular-nums",
        streak > 0 ? "text-warning" : "text-text-subtle",
      )}
    >
      <Flame size={16} strokeWidth={1.75} aria-hidden />
      {streak}
    </span>
  );
}
