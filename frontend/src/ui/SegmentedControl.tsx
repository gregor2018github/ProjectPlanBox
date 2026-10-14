import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { LucideIcon } from "lucide-react";

import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

/** One choice in a {@link SegmentedControl}. */
export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

/** Props for {@link SegmentedControl}. */
export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  /** Shows each label next to its icon (instead of only in a tooltip). */
  showLabels?: boolean;
}

/**
 * A compact single-choice group of icon toggles, e.g. the theme switch;
 * with `showLabels` the toggles carry their text (e.g. a view's mode).
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  showLabels = false,
}: SegmentedControlProps<T>) {
  const toggleClass =
    "inline-flex items-center justify-center rounded-sm text-text-muted transition-colors duration-(--duration-fast) ease-out hover:text-text data-[pressed]:bg-surface data-[pressed]:text-text data-[pressed]:shadow-sm";
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const picked = options.find((o) => o.value === next[0]);
        if (picked) onChange(picked.value);
      }}
      className="inline-flex gap-0.5 rounded-md bg-hover p-0.5"
    >
      {options.map((option) =>
        showLabels ? (
          <Toggle
            key={option.value}
            value={option.value}
            className={cx(
              toggleClass,
              "h-7 gap-1.5 px-2.5 text-sm whitespace-nowrap coarse:h-11 coarse:px-3",
            )}
          >
            <option.icon size={16} strokeWidth={1.75} aria-hidden />
            {option.label}
          </Toggle>
        ) : (
          <Tooltip key={option.value} content={option.label} side="top">
            <Toggle
              value={option.value}
              aria-label={option.label}
              className={cx(toggleClass, "size-7 coarse:size-11")}
            >
              <option.icon size={16} strokeWidth={1.75} aria-hidden />
            </Toggle>
          </Tooltip>
        ),
      )}
    </ToggleGroup>
  );
}
