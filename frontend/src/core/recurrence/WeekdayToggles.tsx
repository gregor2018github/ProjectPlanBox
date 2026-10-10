import { cx } from "../../ui/cx";
import { WEEKDAYS, type Weekday } from "./recurrence";

/** Props for {@link WeekdayToggles}. */
export interface WeekdayTogglesProps {
  value: readonly Weekday[];
  onChange: (days: Weekday[]) => void;
}

const NAMES: Record<Weekday, [short: string, long: string]> = {
  MO: ["M", "Monday"],
  TU: ["T", "Tuesday"],
  WE: ["W", "Wednesday"],
  TH: ["T", "Thursday"],
  FR: ["F", "Friday"],
  SA: ["S", "Saturday"],
  SU: ["S", "Sunday"],
};

/** Seven toggle buttons for the days a weekly series repeats on (at least one stays on). */
export function WeekdayToggles({ value, onChange }: WeekdayTogglesProps) {
  return (
    <div role="group" aria-label="Repeat on" className="flex gap-1">
      {WEEKDAYS.map((day) => {
        const on = value.includes(day);
        const [short, long] = NAMES[day];
        return (
          <button
            key={day}
            type="button"
            aria-label={long}
            aria-pressed={on}
            onClick={() => {
              if (on && value.length === 1) return;
              onChange(on ? value.filter((d) => d !== day) : [...value, day]);
            }}
            className={cx(
              "flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors duration-(--duration-fast) ease-out coarse:size-11",
              on
                ? "bg-accent text-on-accent hover:bg-accent-hover"
                : "bg-hover text-text-muted hover:text-text",
            )}
          >
            {short}
          </button>
        );
      })}
    </div>
  );
}
