import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";

import { useShortcut } from "../../../core/shortcuts/useShortcut";
import {
  addDays,
  addMonths,
  formatMonth,
  startOfMonthOf,
  startOfWeekOf,
  type IsoDate,
} from "../../../core/time";
import { DESKTOP_QUERY, useMediaQuery } from "../../../core/useMediaQuery";
import { useToday } from "../../../core/useToday";
import { AgendaDay } from "../components/AgendaDay";
import { MonthView } from "../components/MonthView";
import { CalendarToolbar } from "../components/CalendarToolbar";
import { TimeGridView } from "../components/TimeGridView";
import { newDraft, newTimedDraft } from "../draft";
import { formatDayTitle, formatWeekRange } from "../format";
import { CALENDAR_PATH, parseCalendarSearch, type CalendarSearch } from "../paths";
import { daysFrom, emptyDay } from "../selectors";
import type { CalendarView } from "../types";
import { useCalendarActions } from "../useCalendarActions";
import { useCalendarDays } from "../useCalendarDays";
import { useNow } from "../useNow";
import { useSwipeNavigation } from "../useSwipeNavigation";

const DEFAULT_VIEW: CalendarView = "week";
const EMPTY = emptyDay();

/** Days shown by a view around `date`. */
function visibleDays(view: CalendarView, date: IsoDate): IsoDate[] {
  if (view === "month") return daysFrom(startOfWeekOf(startOfMonthOf(date)), 42);
  if (view === "week") return daysFrom(startOfWeekOf(date), 7);
  return [date];
}

/** Moves `date` by one period of `view` (direction -1 or 1). */
function step(view: CalendarView, date: IsoDate, direction: number): IsoDate {
  if (view === "month") return addMonths(date, direction);
  return addDays(date, view === "week" ? 7 * direction : direction);
}

/**
 * The full-page calendar: month, week or day, with the period and view in the
 * URL. On a phone the toolbar is compact, a sideways swipe changes the
 * period, and the month view picks a day (the `date`) and lists it below.
 */
export function CalendarPage() {
  // Module routes are assembled at runtime, so the router cannot type search params here.
  const search = parseCalendarSearch(useSearch({ strict: false }));
  const navigate = useNavigate();
  const actions = useCalendarActions();
  const timeZone = actions.timeZone;
  const today = useToday();
  const now = useNow(timeZone);
  const todayDate = today ?? now.date;
  const view = search.view ?? DEFAULT_VIEW;
  const date = search.date ?? todayDate;

  const compact = !useMediaQuery(DESKTOP_QUERY);
  // On a phone the month view lists the picked day (`date`) below the grid.
  const monthAgenda = compact && view === "month";

  const days = useMemo(() => visibleDays(view, date), [view, date]);
  const { byDay } = useCalendarDays(days, timeZone);

  const go = (patch: CalendarSearch, replace = false) => {
    void navigate({
      to: CALENDAR_PATH,
      search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
      replace,
    });
  };
  const openDay = (day: IsoDate) => {
    go({ view: "day", date: day });
  };
  const goToday = () => {
    go({ date: todayDate });
  };
  const previous = () => {
    go({ date: step(view, date, -1) });
  };
  const next = () => {
    go({ date: step(view, date, 1) });
  };
  // Picking a day in the phone's month view is not a page of its own for "back".
  const selectDay = (day: IsoDate) => {
    go({ date: day }, true);
  };
  const swipe = useSwipeNavigation(previous, next);
  const newEvent = () => {
    actions.openNew(newTimedDraft(view === "day" || monthAgenda ? date : todayDate, now));
  };

  useShortcut({
    id: "calendar.today",
    keys: "T",
    description: "Go to today",
    group: "Calendar",
    run: goToday,
  });
  useShortcut({
    id: "calendar.next",
    keys: "J",
    description: "Next period",
    group: "Calendar",
    run: next,
  });
  useShortcut({
    id: "calendar.previous",
    keys: "K",
    description: "Previous period",
    group: "Calendar",
    run: previous,
  });
  useShortcut({
    id: "calendar.view.month",
    keys: "M",
    description: "Month view",
    group: "Calendar",
    run: () => {
      go({ view: "month" });
    },
  });
  useShortcut({
    id: "calendar.view.week",
    keys: "W",
    description: "Week view",
    group: "Calendar",
    run: () => {
      go({ view: "week" });
    },
  });
  useShortcut({
    id: "calendar.view.day",
    keys: "D",
    description: "Day view",
    group: "Calendar",
    run: () => {
      go({ view: "day" });
    },
  });

  const inView = monthAgenda
    ? date === todayDate
    : days.includes(todayDate) && (view !== "month" || date.slice(0, 7) === todayDate.slice(0, 7));
  const title =
    view === "month"
      ? formatMonth(date)
      : view === "week"
        ? formatWeekRange(days[0] ?? date, compact)
        : formatDayTitle(date, compact);

  return (
    <div className="flex h-full flex-col">
      <CalendarToolbar
        title={title}
        view={view}
        showToday={!inView}
        onToday={goToday}
        onPrevious={previous}
        onNext={next}
        onView={(v) => {
          go({ view: v });
        }}
        onNew={newEvent}
        compact={compact}
      />
      <div className="flex min-h-0 flex-1 flex-col" {...swipe}>
        {monthAgenda ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            <MonthView
              days={days}
              month={date}
              today={todayDate}
              byDay={byDay}
              actions={actions}
              onOpenDay={selectDay}
              onCreate={(day) => {
                actions.openNew(newDraft(day));
              }}
              selected={date}
              compact
            />
            <div className="mt-2">
              <AgendaDay
                date={date}
                today={todayDate}
                items={byDay.get(date) ?? EMPTY}
                surface="month:agenda"
                actions={actions}
              />
            </div>
          </div>
        ) : view === "month" ? (
          <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 md:px-4 md:pb-4">
            <MonthView
              days={days}
              month={date}
              today={todayDate}
              byDay={byDay}
              actions={actions}
              onOpenDay={openDay}
              onCreate={(day) => {
                actions.openNew(newDraft(day));
              }}
            />
          </div>
        ) : (
          <TimeGridView
            days={days}
            today={todayDate}
            now={now}
            byDay={byDay}
            actions={actions}
            {...(view === "week" && { onOpenDay: openDay })}
            onCreate={(draft) => {
              actions.openNew(draft);
            }}
            compact={compact}
          />
        )}
      </div>
    </div>
  );
}
