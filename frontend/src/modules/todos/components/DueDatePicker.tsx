import { CalendarDays } from "lucide-react";

import { formatRelativeDay, type IsoDate } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Popover } from "../../../ui/Popover";
import type { TodoActions } from "../useTodoActions";
import { CalendarGrid } from "./CalendarGrid";

/** Props for {@link DueDatePicker}. */
export interface DueDatePickerProps {
  value: IsoDate | null;
  today: IsoDate;
  onChange: (date: IsoDate | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: TodoActions;
}

/** A button showing the due date; opens quick picks and a month grid. */
export function DueDatePicker({
  value,
  today,
  onChange,
  open,
  onOpenChange,
  actions,
}: DueDatePickerProps) {
  const dates = actions.quickDates();
  const pick = (date: IsoDate | null) => {
    onChange(date);
    onOpenChange(false);
  };
  const overdue = value !== null && value < today;
  const quick: [string, IsoDate | null][] = dates
    ? [
        ["Today", dates.today],
        ["Tomorrow", dates.tomorrow],
        ["Next Monday", dates.nextMonday],
        ["In a week", dates.nextWeek],
      ]
    : [];

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      label="Due date"
      trigger={
        <Button
          size="sm"
          className={cx(overdue && "text-danger", value === null && "text-text-muted")}
        >
          <CalendarDays size={16} strokeWidth={1.75} aria-hidden />
          {value === null ? "Add date" : formatRelativeDay(value, today)}
        </Button>
      }
    >
      <div className="flex flex-col">
        <div className="flex flex-wrap gap-1 border-b border-border p-2">
          {quick.map(([label, date]) => (
            <Button
              key={label}
              size="sm"
              variant="secondary"
              onClick={() => {
                pick(date);
              }}
            >
              {label}
            </Button>
          ))}
          {value !== null && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                pick(null);
              }}
            >
              No date
            </Button>
          )}
        </div>
        <CalendarGrid selected={value} today={today} onSelect={pick} />
      </div>
    </Popover>
  );
}
