import { useNavigate } from "@tanstack/react-router";
import { Maximize2, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { RailPaneProps } from "../../../core/module";
import {
  addDays,
  daysBetween,
  startOfMonthOf,
  startOfWeekOf,
  type IsoDate,
} from "../../../core/time";
import { useToday } from "../../../core/useToday";
import { Button } from "../../../ui/Button";
import { IconButton } from "../../../ui/IconButton";
import { newTimedDraft } from "../draft";
import { CALENDAR_PATH } from "../paths";
import { agendaDays, dayCount, daysFrom } from "../selectors";
import { useCalendarActions } from "../useCalendarActions";
import { useCalendarDays } from "../useCalendarDays";
import { useNow } from "../useNow";
import { AgendaDay } from "./AgendaDay";
import { MiniMonth } from "./MiniMonth";

/** How many days the agenda looks ahead from the selected day. */
const AGENDA_DAYS = 7;
const SURFACE = "pane";

/**
 * The calendar's rail pane: a mini month to pick a day (and drop todos on),
 * then the agenda of that day and the busy days after it.
 */
export function CalendarPane({ onClose }: RailPaneProps) {
  const actions = useCalendarActions();
  const timeZone = actions.timeZone;
  const today = useToday();
  const now = useNow(timeZone);
  const navigate = useNavigate();
  const [picked, setPicked] = useState<IsoDate | null>(null);
  const selected = picked ?? today ?? now.date;
  const month = startOfMonthOf(selected);
  const gridStart = startOfWeekOf(month);

  const days = useMemo(() => {
    const agendaEnd = addDays(selected, AGENDA_DAYS - 1);
    return daysFrom(gridStart, Math.max(42, daysBetween(gridStart, agendaEnd) + 1));
  }, [gridStart, selected]);
  const { byDay } = useCalendarDays(days, timeZone);

  // A multi-day event is listed once, on the first agenda day it touches.
  const agendaItems = agendaDays(daysFrom(selected, AGENDA_DAYS), byDay);
  const agenda = [...agendaItems].filter(([day, items]) => day === selected || dayCount(items) > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3">
        <h2 className="flex-1 pl-1 text-base font-semibold">Calendar</h2>
        {today !== null && selected !== today && (
          <Button
            size="sm"
            onClick={() => {
              setPicked(null);
            }}
          >
            Today
          </Button>
        )}
        <IconButton
          label="New event"
          icon={Plus}
          shortcut="N"
          onClick={() => {
            actions.openNew(newTimedDraft(selected, now));
          }}
        />
        <IconButton
          label="Open full calendar"
          icon={Maximize2}
          shortcut="G C"
          onClick={() => {
            // The full page shows the same calendar, so the pane would only double it.
            onClose();
            void navigate({ to: CALENDAR_PATH, search: { date: selected } });
          }}
        />
        <IconButton label="Close calendar" icon={X} shortcut="C" onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <MiniMonth
          days={days.slice(0, 42)}
          month={month}
          selected={selected}
          today={today ?? now.date}
          byDay={byDay}
          surface={SURFACE}
          onSelect={setPicked}
        />
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-1">
          {agenda.map(([day, items]) => (
            <AgendaDay
              key={day}
              date={day}
              today={today ?? now.date}
              items={items}
              surface={SURFACE}
              actions={actions}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
