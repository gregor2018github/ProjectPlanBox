import { describe, expect, it } from "vitest";

import { activityDays } from "./activity";
import { makeTodo } from "./testData";

const ZONE = "Europe/Amsterdam";

describe("activityDays", () => {
  it("marks each todo by what happened on the day it was last touched", () => {
    const added = makeTodo({
      created_at: "2026-10-08T09:00:00.000Z",
      updated_at: "2026-10-08T15:00:00.000Z",
    });
    const changed = makeTodo({
      created_at: "2026-10-01T09:00:00.000Z",
      updated_at: "2026-10-08T12:00:00.000Z",
    });
    const completed = makeTodo({
      created_at: "2026-10-08T07:00:00.000Z",
      completed_at: "2026-10-08T10:00:00.000Z",
      updated_at: "2026-10-08T10:00:00.000Z",
    });
    const older = makeTodo({
      created_at: "2026-10-01T09:00:00.000Z",
      completed_at: "2026-10-02T09:00:00.000Z",
      updated_at: "2026-10-07T09:00:00.000Z",
    });

    const days = activityDays([added, changed, completed, older], ZONE);

    expect(days).toEqual([
      {
        day: "2026-10-08",
        groups: [
          { kind: "added", todos: [added] },
          { kind: "changed", todos: [changed] },
          { kind: "completed", todos: [completed] },
        ],
      },
      { day: "2026-10-07", groups: [{ kind: "changed", todos: [older] }] },
    ]);
  });

  it("uses the local day, not the UTC one", () => {
    const lateEvening = makeTodo({
      created_at: "2026-10-07T22:30:00.000Z",
      updated_at: "2026-10-07T22:30:00.000Z",
    });

    expect(activityDays([lateEvening], ZONE)[0]?.day).toBe("2026-10-08");
  });
});
