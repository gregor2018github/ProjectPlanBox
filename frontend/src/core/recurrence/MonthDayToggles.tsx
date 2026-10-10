import { cx } from "../../ui/cx";
import { dayOrdinal, LAST_DAY, sortMonthDays } from "./recurrence";

/** Props for {@link MonthDayToggles}. */
export interface MonthDayTogglesProps {
  value: readonly number[];
  onChange: (days: number[]) => void;
}

const DAYS = [...Array.from({ length: 31 }, (_, i) => i + 1), LAST_DAY];

/**
 * Toggle buttons for the days of the month a monthly series repeats on: 1 to
 * 31 and "Last" (at least one stays on). Months without a chosen day (the
 * 31st in April) skip it.
 */
export function MonthDayToggles({ value, onChange }: MonthDayTogglesProps) {
  return (
    <div role="group" aria-label="Days of the month" className="grid grid-cols-7 gap-1">
      {DAYS.map((day) => {
        const on = value.includes(day);
        const last = day === LAST_DAY;
        return (
          <button
            key={day}
            type="button"
            aria-label={`The ${dayOrdinal(day)}`}
            aria-pressed={on}
            onClick={() => {
              if (on && value.length === 1) return;
              onChange(sortMonthDays(on ? value.filter((d) => d !== day) : [...value, day]));
            }}
            className={cx(
              "flex h-8 items-center justify-center rounded-sm text-sm tabular-nums transition-colors duration-(--duration-fast) ease-out coarse:h-11",
              last && "col-span-4",
              on
                ? "bg-accent text-on-accent hover:bg-accent-hover"
                : "bg-hover text-text-muted hover:text-text",
            )}
          >
            {last ? "Last day" : day}
          </button>
        );
      })}
    </div>
  );
}
