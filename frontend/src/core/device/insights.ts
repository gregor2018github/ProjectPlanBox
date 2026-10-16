/** Insights on the device: the twin of `backend/planbox/core/insights/`. */
import { isValidId, newId } from "../ids";
import { nowIso } from "./clock";
import { text, type Row } from "./db";
import { ValidationFailed } from "./errors";
import { Answer, type DeviceContext, type Handlers } from "./server";
import { dateDay, instantMs, isoDate, midnight, toIso, toLocal, weekday } from "./time";

const MAX_RANGE_DAYS = 400;
const ACTIONS = ["created", "completed", "deleted"] as const;

interface Counts {
  created: number;
  completed: number;
  deleted: number;
  opens: number;
}

function openOf(row: Row) {
  return { id: text(row, "id"), created_at: text(row, "created_at") };
}

function recordOpen(
  ctx: DeviceContext,
  openId: string | null,
): [{ id: string; created_at: string }, boolean] {
  if (openId !== null && !isValidId(openId))
    throw new ValidationFailed("id must be a lowercase UUIDv7");
  return ctx.db.transaction(() => {
    if (openId !== null) {
      const existing = ctx.db.get("SELECT id, created_at FROM core_app_opens WHERE id = ?", [
        openId,
      ]);
      if (existing !== undefined) return [openOf(existing), false];
    }
    const now = nowIso(ctx.clock);
    const row = { id: openId ?? newId(), created_at: now, updated_at: now, deleted_at: null };
    ctx.db.run(
      "INSERT INTO core_app_opens (id, created_at, updated_at, deleted_at) " +
        "VALUES (:id, :created_at, :updated_at, :deleted_at)",
      row,
    );
    return [{ id: row.id, created_at: now }, true];
  });
}

function activity(ctx: DeviceContext, startText: string, endText: string) {
  const start = dateDay(startText);
  const end = dateDay(endText);
  if (end < start) throw new ValidationFailed("end must not be before start");
  if (end - start + 1 > MAX_RANGE_DAYS) {
    throw new ValidationFailed(`a range covers at most ${String(MAX_RANGE_DAYS)} days`);
  }
  const since = toIso(midnight(start, ctx.zone));
  const until = toIso(midnight(end + 1, ctx.zone));
  const window = { since, now: nowIso(ctx.clock), zone: ctx.zone };
  const perDay = new Map<number, Counts>();
  const bucket = (day: number): Counts => {
    let found = perDay.get(day);
    if (found === undefined) {
      found = { created: 0, completed: 0, deleted: 0, opens: 0 };
      perDay.set(day, found);
    }
    return found;
  };
  const types = [];
  for (const type of ctx.registry.all()) {
    if (type.activity === undefined) continue;
    const totals = { created: 0, completed: 0, deleted: 0 };
    for (const event of type.activity(ctx.db, window)) {
      if (event.at < since || event.at >= until) continue;
      bucket(toLocal(instantMs(event.at), ctx.zone).day)[event.action] += 1;
      totals[event.action] += 1;
    }
    types.push({ entity_type: type.name, ...totals });
  }
  const byHour: number[] = Array<number>(24).fill(0);
  const byWeekday: number[] = Array<number>(7).fill(0);
  const opens = ctx.db
    .all(
      "SELECT created_at FROM core_app_opens WHERE deleted_at IS NULL " +
        "AND created_at >= ? AND created_at < ? ORDER BY created_at",
      [since, until],
    )
    .map((r) => text(r, "created_at"));
  for (const instant of opens) {
    const local = toLocal(instantMs(instant), ctx.zone);
    bucket(local.day).opens += 1;
    byHour[Math.floor(local.ms / 3_600_000)] = (byHour[Math.floor(local.ms / 3_600_000)] ?? 0) + 1;
    byWeekday[weekday(local.day)] = (byWeekday[weekday(local.day)] ?? 0) + 1;
  }
  const totals = ctx.db.get(
    "SELECT count(*) AS n, min(created_at) AS first FROM core_app_opens WHERE deleted_at IS NULL",
  );
  const days = [...perDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, counts]) => ({ date: isoDate(day), ...pick(counts) }));
  return {
    start: startText,
    end: endText,
    days,
    types,
    opens: {
      in_range: opens.length,
      all_time: Number(totals?.n ?? 0),
      first_at: totals?.first == null ? null : String(totals.first),
      by_hour: byHour,
      by_weekday: byWeekday,
    },
  };
}

function pick(counts: Counts) {
  const out = { created: 0, completed: 0, deleted: 0, opens: counts.opens };
  for (const action of ACTIONS) out[action] = counts[action];
  return out;
}

/** `/api/insights`. */
export const insightHandlers: Handlers = {
  core_record_open: ({ body }, ctx) => {
    const [row, created] = recordOpen(ctx, body.id ?? null);
    return created ? row : new Answer(row, 200);
  },
  core_get_activity: ({ query }, ctx) => activity(ctx, query.start, query.end),
};
