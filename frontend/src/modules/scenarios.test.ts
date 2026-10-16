/**
 * Replays the API scenarios recorded from the Python backend
 * (`shared/api-scenarios.json`) on the device backend: both must answer
 * every request alike. See `backend/tests/api_scenarios.py`.
 */
import { describe, expect, it } from "vitest";

import recorded from "../../../shared/api-scenarios.json";
import { FixedClock } from "../core/device/clock";
import { openTestDevice } from "./deviceTesting";

interface Step {
  method: string;
  path: string;
  body?: unknown;
  advance?: number;
  expect: { status: number; code?: string | null; body?: unknown };
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g;
const PLACEHOLDER = /\{#(\d+)\}/g;
const VOLATILE_KEYS = new Set([
  "app_version",
  "size",
  "device_id",
  "device_name",
  "available",
  "path",
]);

/** The twin of `Normalizer` in api_scenarios.py. */
class Normalizer {
  private readonly known = new Set<string>();
  private readonly made = new Map<string, string>();

  learn(value: unknown): void {
    for (const text of strings(value)) for (const id of text.match(UUID) ?? []) this.known.add(id);
  }

  expand(value: unknown): unknown {
    const reverse = new Map([...this.made].map(([real, alias]) => [alias, real]));
    if (typeof value === "string")
      return value.replace(PLACEHOLDER, (_, n: string) => reverse.get(`#${n}`) ?? "");
    if (Array.isArray(value)) return value.map((v) => this.expand(v));
    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.expand(v)]));
    }
    return value;
  }

  apply(value: unknown): unknown {
    if (typeof value === "string") return value.replace(UUID, (id) => this.swap(id));
    if (Array.isArray(value)) return value.map((v) => this.apply(v));
    if (typeof value === "object" && value !== null) {
      const obj = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(obj)
          .sort()
          .map((k) => [k, VOLATILE_KEYS.has(k) ? "*" : this.apply(obj[k])]),
      );
    }
    return value;
  }

  private swap(id: string): string {
    if (this.known.has(id)) return id;
    let alias = this.made.get(id);
    if (alias === undefined) {
      alias = `#${String(this.made.size + 1)}`;
      this.made.set(id, alias);
    }
    return alias;
  }
}

function* strings(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const v of value) yield* strings(v);
  else if (typeof value === "object" && value !== null)
    for (const v of Object.values(value)) yield* strings(v);
}

const START = Date.parse(recorded.start);

describe("device backend answers like the Python backend", () => {
  for (const [name, steps] of Object.entries(recorded.scenarios as Record<string, Step[]>)) {
    it(name, async () => {
      const clock = new FixedClock(START);
      const device = await openTestDevice({ clock, deviceName: "Scenario" });
      const norm = new Normalizer();
      for (const [index, step] of steps.entries()) {
        if (step.advance) clock.advance(step.advance * 1000);
        norm.learn(step.body);
        norm.learn(step.path);
        const path = norm.expand(step.path) as string;
        const answer = await device.call<{ code?: string } | null>(
          step.method,
          path,
          norm.expand(step.body),
        );
        const label = `${name} #${String(index)}: ${step.method} ${step.path}`;
        if (step.expect.status >= 400) {
          expect({ status: answer.status, code: answer.body?.code }, label).toEqual({
            status: step.expect.status,
            code: step.expect.code,
          });
        } else {
          expect(answer.status, `${label} ${JSON.stringify(answer.body)}`).toBe(step.expect.status);
          expect(norm.apply(answer.body), label).toEqual(step.expect.body);
        }
      }
    });
  }
});
