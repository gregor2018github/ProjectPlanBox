/**
 * Health, metadata, preferences, and the PC-only routes as the phone app
 * answers them: always signed in, never a power button, no phone pairing.
 */
import { newId } from "../ids";
import { nowIso } from "./clock";
import { text } from "./db";
import { Conflict } from "./errors";
import { appliedVersions } from "./migrations";
import type { DeviceContext, Handlers } from "./server";

const THEMES = ["system", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];

function preferences(ctx: DeviceContext): { theme: Theme | null } {
  const rows = ctx.db.all("SELECT key, value FROM core_preferences WHERE deleted_at IS NULL");
  const theme = rows.find((r) => r.key === "theme")?.value;
  return { theme: THEMES.includes(theme as Theme) ? (theme as Theme) : null };
}

function setTheme(ctx: DeviceContext, theme: Theme): void {
  ctx.db.transaction(() => {
    const now = nowIso(ctx.clock);
    const row = ctx.db.get("SELECT id FROM core_preferences WHERE deleted_at IS NULL AND key = ?", [
      "theme",
    ]);
    if (row === undefined) {
      ctx.db.run(
        "INSERT INTO core_preferences (id, key, value, created_at, updated_at, deleted_at) " +
          "VALUES (?, ?, ?, ?, ?, NULL)",
        [newId(), "theme", theme, now, now],
      );
    } else {
      ctx.db.run("UPDATE core_preferences SET value = ?, updated_at = ? WHERE id = ?", [
        theme,
        now,
        text(row, "id"),
      ]);
    }
  });
}

const SESSION = { signed_in: true, local: true, phone_access: false };

/** Meta, health, preferences, auth and shutdown on the device. */
export const metaHandlers: Handlers = {
  core_get_health: (_, ctx) => ({
    status: ctx.db.get("SELECT 1 AS ok")?.ok === 1 ? "ok" : "degraded",
    version: ctx.version,
    schema_versions: appliedVersions(ctx.db),
  }),
  core_get_meta: (_, ctx) => ({
    version: ctx.version,
    mode: "serve",
    timezone: ctx.zone,
    week_starts_on: 1,
    can_shutdown: false,
  }),
  core_get_preferences: (_, ctx) => preferences(ctx),
  core_patch_preferences: ({ body }, ctx) => {
    if (body.theme != null) setTheme(ctx, body.theme);
    return preferences(ctx);
  },
  core_get_session: () => SESSION,
  core_sign_in: () => SESSION,
  core_sign_out: () => SESSION,
  core_get_phone_access: () => ({ enabled: false, urls: [], tls: false, pairing: null }),
  core_start_pairing: () => {
    throw new Conflict("Phone pairing is for PlanBox on a PC; the phone app keeps its own data.");
  },
  core_sign_out_everywhere: () => ({ enabled: false, urls: [], tls: false, pairing: null }),
  core_shutdown: () => {
    throw new Conflict("This server cannot be shut down from the app. Stop it where it runs.");
  },
};
