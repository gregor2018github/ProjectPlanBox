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
