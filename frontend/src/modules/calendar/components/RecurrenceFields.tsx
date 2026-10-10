import { format, parseISO } from "date-fns";
import { Repeat as RepeatIcon } from "lucide-react";

import type { IsoDate } from "../../../core/time";
import { Input } from "../../../ui/Input";
import { Select } from "../../../ui/Select";
import {
  defaultSpec,
  describeRule,
  nthWeekdayOf,
  ruleOf,
  untilDefault,
  type Frequency,
  type RecurrenceSpec,
  type Repeat,
} from "../recurrence";
import { WeekdayToggles } from "./WeekdayToggles";

/** Props for {@link RecurrenceFields}. */
export interface RecurrenceFieldsProps {
  value: Repeat;
  /** The (occurrence's) start date the rule is relative to. */
  start: IsoDate;
  timeZone: string;
  onChange: (repeat: Repeat) => void;
}

const FREQUENCIES: [Frequency, string][] = [
  ["DAILY", "Daily"],
  ["WEEKLY", "Weekly"],
  ["MONTHLY", "Monthly"],
  ["YEARLY", "Yearly"],
];
const UNITS: Record<Frequency, string> = {
  DAILY: "days",
  WEEKLY: "weeks",
  MONTHLY: "months",
  YEARLY: "years",
};
const ORDINALS: Record<number, string> = {
  1: "first",
  2: "second",
  3: "third",
  4: "fourth",
  [-1]: "last",
};

/** The repeat part of the event dialog: frequency, interval, days, and when it ends. */
export function RecurrenceFields({ value, start, timeZone, onChange }: RecurrenceFieldsProps) {
  const spec = value.kind === "spec" ? value.spec : null;
  const rule = ruleOf(value, start);
  const setSpec = (patch: Partial<RecurrenceSpec>) => {
    if (spec) onChange({ kind: "spec", spec: { ...spec, ...patch } });
  };
  const nth = ORDINALS[nthWeekdayOf(start)] ?? "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <RepeatIcon size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
        <Select
          aria-label="Repeat"
          value={value.kind === "spec" ? value.spec.freq : value.kind}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "none") onChange({ kind: "none" });
            else if (next !== "custom")
              onChange({ kind: "spec", spec: defaultSpec(next as Frequency, start) });
          }}
          className="flex-1"
        >
          <option value="none">Does not repeat</option>
          {FREQUENCIES.map(([freq, label]) => (
            <option key={freq} value={freq}>
              {label}
            </option>
          ))}
          {value.kind === "custom" && <option value="custom">Custom rule</option>}
        </Select>
      </div>

      {spec && (
        <div className="flex flex-col gap-2 pl-6">
          <label className="flex items-center gap-2 text-sm text-text-muted">
            Every
            <Input
              type="number"
              min={1}
              max={99}
              aria-label="Repeat interval"
              value={spec.interval}
              onChange={(event) => {
                const n = Math.min(Math.max(Math.round(Number(event.target.value)), 1), 99);
                if (Number.isFinite(n)) setSpec({ interval: n });
              }}
              className="w-16"
            />
            {UNITS[spec.freq]}
          </label>
          {spec.freq === "WEEKLY" && (
            <WeekdayToggles
              value={spec.byDay}
              onChange={(byDay) => {
                setSpec({ byDay });
              }}
            />
          )}
          {spec.freq === "MONTHLY" && (
            <Select
              aria-label="Repeat monthly on"
              value={spec.monthly}
              onChange={(event) => {
                setSpec({ monthly: event.target.value === "weekday" ? "weekday" : "day" });
              }}
            >
              <option value="day">{`On day ${String(Number(start.slice(8)))}`}</option>
              <option value="weekday">{`On the ${nth} ${format(parseISO(start), "EEEE")}`}</option>
            </Select>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Ends"
              value={spec.end.kind}
              onChange={(event) => {
                const kind = event.target.value;
                setSpec({
                  end:
                    kind === "count"
                      ? { kind: "count", count: 10 }
                      : kind === "until"
                        ? { kind: "until", date: untilDefault(start) }
                        : { kind: "never" },
                });
              }}
            >
              <option value="never">Never ends</option>
              <option value="until">Ends on</option>
              <option value="count">Ends after</option>
            </Select>
            {spec.end.kind === "until" && (
              <Input
                type="date"
                aria-label="End date"
                value={spec.end.date}
                min={start}
                onChange={(event) => {
                  if (event.target.value)
                    setSpec({ end: { kind: "until", date: event.target.value } });
                }}
                className="w-auto"
              />
            )}
            {spec.end.kind === "count" && (
              <label className="flex items-center gap-2 text-sm text-text-muted">
                <Input
                  type="number"
                  min={1}
                  max={999}
                  aria-label="Number of times"
                  value={spec.end.count}
                  onChange={(event) => {
                    const n = Math.min(Math.max(Math.round(Number(event.target.value)), 1), 999);
                    if (Number.isFinite(n)) setSpec({ end: { kind: "count", count: n } });
                  }}
                  className="w-20"
                />
                times
              </label>
            )}
          </div>
        </div>
      )}
      {rule !== null && (
        <p className="pl-6 text-sm text-text-muted">{describeRule(rule, start, timeZone)}</p>
      )}
    </div>
  );
}
