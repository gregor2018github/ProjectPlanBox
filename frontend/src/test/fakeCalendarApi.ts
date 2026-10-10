/**
 * An in-memory stand-in for the calendar API, good enough for UI tests. It
 * stores single events exactly and expands only simple weekly series; the
 * real recurrence rules are tested against the backend. Requests it does not
 * know go to `fallback` (e.g. the fake todos API).
 */
import type { FetchFn } from "../core/api/client";
import { addDays } from "../core/time";
import { placeLike, singleOccurrence } from "../modules/calendar/timing";
import type { CalendarEvent, Occurrence } from "../modules/calendar/types";

/** The fake server's state, inspectable by tests. */
export interface FakeCalendarState {
  events: (CalendarEvent & { deleted?: boolean })[];
  /** Skipped occurrences as `<event id>:<date>`. */
  exceptions: Set<string>;
  requests: { method: string; path: string; query: string; body: unknown }[];
}

const TIME_ZONE = "Europe/Amsterdam";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function occurrencesOf(
  event: CalendarEvent,
  start: string,
  end: string,
  skip: Set<string>,
): Occurrence[] {
  const first = singleOccurrence(event, TIME_ZONE);
  if (event.rrule === null) {
    const last = event.end_date ?? first.occurrence_date;
    return first.occurrence_date < end && last >= start ? [first] : [];
  }
  // Weekly only: enough for the UI tests.
  const result: Occurrence[] = [];
  for (let date = first.occurrence_date; date < end; date = addDays(date, 7)) {
    if (date >= start && !skip.has(`${event.id}:${date}`)) {
      result.push({
        ...placeLike(event, date, TIME_ZONE),
        event_id: event.id,
        occurrence_date: date,
      });
    }
  }
  return result;
}

/** Creates a fake calendar API in front of `fallback`. */
export function createFakeCalendarApi(seed: CalendarEvent[] = [], fallback?: FetchFn) {
  const state: FakeCalendarState = {
    events: seed.map((e) => ({ ...e })),
    exceptions: new Set(),
    requests: [],
  };
  const live = () => state.events.filter((e) => e.deleted !== true);
  const strip = ({ deleted, ...event }: FakeCalendarState["events"][number]): CalendarEvent =>
    event;

  const fetch: FetchFn = async (request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith("/api/calendar/")) {
      if (fallback) return fallback(request);
      return json({ title: "Not found", status: 404, detail: path, code: "not_found" }, 404);
    }
    const method = request.method;
    const text = method === "GET" || method === "DELETE" ? "" : await request.text();
    const body = (text === "" ? {} : JSON.parse(text)) as Record<string, unknown>;
    state.requests.push({ method, path, query: url.search, body });
    // ["api", "calendar", "events", id, "restore" | "occurrences", date, "restore"]
    const [, , , id, sub, date] = path.split("/").filter(Boolean);
    const target = state.events.find((e) => e.id === id);

    if (path === "/api/calendar/events" && method === "GET") {
      const start = url.searchParams.get("start") ?? "";
      const end = url.searchParams.get("end") ?? "";
      const occurrences = live().flatMap((e) => occurrencesOf(e, start, end, state.exceptions));
      const ids = new Set(occurrences.map((o) => o.event_id));
      return json({
        events: live()
          .filter((e) => ids.has(e.id))
          .map(strip),
        occurrences,
      });
    }
    if (path === "/api/calendar/events" && method === "POST") {
      const event: CalendarEvent = {
        id: String(body.id),
        title: String(body.title),
        notes: (body.notes as string | undefined) ?? "",
        location: (body.location as string | undefined) ?? "",
        all_day: body.all_day === true,
        start_at: (body.start_at as string | null | undefined) ?? null,
        end_at: (body.end_at as string | null | undefined) ?? null,
        start_date: (body.start_date as string | null | undefined) ?? null,
        end_date: (body.end_date as string | null | undefined) ?? null,
        rrule: (body.rrule as string | null | undefined) ?? null,
        created_at: "2026-10-08T10:00:00.000Z",
        updated_at: "2026-10-08T10:00:00.000Z",
      };
      state.events.push(event);
      return json(event, 201);
    }
    if (target && method === "PATCH") {
      if ((body.scope ?? "all") === "all") {
        const { scope: _scope, occurrence_date: _date, split_id: _split, ...fields } = body;
        Object.assign(target, fields);
        return json({ events: [strip(target)] });
      }
      state.exceptions.add(`${target.id}:${String(body.occurrence_date)}`);
      return json({ events: [strip(target)] });
    }
    if (target && method === "DELETE") {
      const scope = url.searchParams.get("scope") ?? "all";
      if (scope === "this") {
        state.exceptions.add(`${target.id}:${url.searchParams.get("occurrence_date") ?? ""}`);
        return json({ events: [strip(target)] });
      }
      target.deleted = true;
      return json({ events: [] });
    }
    if (target && sub === "restore") {
      target.deleted = false;
      return json(strip(target));
    }
    if (target && sub === "occurrences" && date !== undefined) {
      state.exceptions.delete(`${target.id}:${date}`);
      return json(strip(target));
    }
    return json({ title: "Not found", status: 404, detail: path, code: "not_found" }, 404);
  };

  return { state, fetch };
}
