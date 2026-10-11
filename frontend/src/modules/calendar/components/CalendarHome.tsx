import { useMemo } from "react";

import { HomeCard } from "../../../core/home/HomeCard";
import { plural } from "../../../core/insights/format";
import { useToday } from "../../../core/useToday";
import { CALENDAR_PATH } from "../paths";
import { agendaDays, dayCount, daysFrom, type DayItems } from "../selectors";
import { useCalendarActions } from "../useCalendarActions";
import { useCalendarDays } from "../useCalendarDays";
import { useNow } from "../useNow";
import { AgendaDay } from "./AgendaDay";

/** How many days the Home agenda looks ahead, today included. */
export const HOME_AGENDA_DAYS = 7;
const SURFACE = "home";

/** A day's events without the feed entries (dated todos have their own card on Home). */
function eventsOnly(items: DayItems): DayItems {
  return { ...items, entries: [] };
}

/**
 * The calendar card on Home: today's events, then the busy days of the
 * coming week. Days accept dropped todos, as in the rail pane.
 */
export function CalendarHome() {
  const actions = useCalendarActions();
  const today = useToday();
  const now = useNow(actions.timeZone);
  const first = today ?? now.date;
  const days = useMemo(() => daysFrom(first, HOME_AGENDA_DAYS), [first]);
  const { byDay, loading } = useCalendarDays(days, actions.timeZone);

  const agenda = [...agendaDays(days, byDay)]
    .map(([day, items]) => [day, eventsOnly(items)] as const)
    .filter(([day, items]) => day === first || dayCount(items) > 0);
  const todayItems = agenda.find(([day]) => day === first)?.[1];
  const todayCount = todayItems === undefined ? 0 : dayCount(todayItems);
  const weekCount = agenda.reduce((sum, [, items]) => sum + dayCount(items), 0);
  const summary = loading
    ? undefined
    : weekCount === 0
      ? "Nothing planned this week"
      : `${plural(todayCount, "event")} today · ${String(weekCount)} this week`;

  return (
    <HomeCard title="Calendar" summary={summary} to={CALENDAR_PATH}>
      <div className="flex flex-col gap-1">
        {agenda.map(([day, items]) => (
          <AgendaDay
            key={day}
            date={day}
            today={first}
            items={items}
            surface={SURFACE}
            actions={actions}
          />
        ))}
      </div>
    </HomeCard>
  );
}
