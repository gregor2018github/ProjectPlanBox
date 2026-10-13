import { describe, expect, it } from "vitest";

import type { ImportReport } from "../api/types";
import { backupLabel, exportFileName, formatBytes, formatInstant, importSummary } from "./format";

const table = (inserted: number, updated: number, conflicts = 0) => ({
  table: "todos",
  inserted,
  updated,
  unchanged: 3,
  conflicts,
});

describe("data formatting", () => {
  it("names backup reasons", () => {
    expect(backupLabel("pre-migration")).toBe("Before update");
    expect(backupLabel("something-new")).toBe("something-new");
  });

  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(48 * 1024)).toBe("48 KB");
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
  });

  it("shows instants in the server's zone", () => {
    expect(formatInstant("2026-10-08T12:05:00.000Z", "Europe/Amsterdam")).toBe("Thu 8 Oct, 14:05");
  });

  it("names exports after their instant", () => {
    expect(exportFileName("2026-10-08T12:05:00.000Z")).toBe(
      "planbox-export-20261008T120500000Z.json",
    );
  });

  it("sums up an import", () => {
    const report = (tables: ImportReport["tables"]): ImportReport => ({ backup: "b.db", tables });
    expect(importSummary(report([table(0, 0)]))).toBe(
      "Nothing new: this PlanBox already had everything.",
    );
    expect(importSummary(report([table(2, 1), table(1, 0)]))).toBe("3 new, 1 updated.");
    expect(importSummary(report([table(1, 0, 1)]))).toBe(
      "1 new, 0 updated. 1 duplicate was stored as deleted.",
    );
  });
});
