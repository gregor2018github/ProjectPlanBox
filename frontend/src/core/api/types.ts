/**
 * Aliases of the generated backend types. Never redeclare backend shapes by
 * hand; regenerate with `py scripts\gen_api.py` instead.
 */
import type { components } from "./schema";

/** An RFC 9457 problem document returned for every API error. */
export type Problem = components["schemas"]["Problem"];

/** GET /api/health */
export type Health = components["schemas"]["HealthOut"];

/** GET /api/meta */
export type Meta = components["schemas"]["MetaOut"];

/** GET /api/data/backups */
export type Backups = components["schemas"]["BackupsOut"];

/** One local backup. */
export type Backup = components["schemas"]["BackupOut"];

/** GET /api/data/export, and the body of POST /api/data/import */
export type ExportFile = components["schemas"]["ExportFile"];

/** POST /api/data/import */
export type ImportReport = components["schemas"]["ImportOut"];

/** GET /api/auth/session */
export type Session = components["schemas"]["SessionOut"];

/** GET /api/auth/phones */
export type PhoneAccess = components["schemas"]["PhoneAccessOut"];

/** GET /api/preferences */
export type Preferences = components["schemas"]["PreferencesOut"];
