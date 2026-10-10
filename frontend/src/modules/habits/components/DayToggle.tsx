import { Check } from "lucide-react";

import { cx } from "../../../ui/cx";
import type { DayState } from "../days";

/** Props for {@link DayToggle}. */
export interface DayToggleProps {
  state: DayState;
  /** Short visible label, e.g. "T" for Thursday. */
  label: string;
  /** Accessible name, e.g. "Stretch on Thu 8 Oct". */
  ariaLabel: string;
  isToday: boolean;
  onToggle: () => void;
}

const STATE_CLASSES: Record<DayState, string> = {
  done: "border-accent bg-accent text-on-accent",
  open: "border-accent text-accent",
  missed: "border-border-strong text-text-muted",
  unscheduled: "border-transparent bg-hover text-text-subtle",
  future: "border-dashed border-border text-text-subtle",
};

/** One day of a habit: a round button that checks or unchecks it. */
export function DayToggle({ state, label, ariaLabel, isToday, onToggle }: DayToggleProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={state === "done"}
      disabled={state === "future"}
      onClick={onToggle}
      className={cx(
        "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors duration-(--duration-fast) ease-out coarse:size-11",
        STATE_CLASSES[state],
        state !== "future" && state !== "done" && "hover:bg-hover",
        isToday && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
      )}
    >
      {state === "done" ? <Check size={14} strokeWidth={2.5} aria-hidden /> : label}
    </button>
  );
}
