import { describe, expect, it } from "vitest";

import { MATCH_END, MATCH_START, splitMarks, stripMarks } from "./marks";

const marked = (text: string) => `${MATCH_START}${text}${MATCH_END}`;

describe("search marks", () => {
  it("splits marked text into plain and matched runs", () => {
    expect(splitMarks(`Write ${marked("rep")}ort ${marked("now")}`)).toEqual([
      { text: "Write ", match: false },
      { text: "rep", match: true },
      { text: "ort ", match: false },
      { text: "now", match: true },
    ]);
  });

  it("handles text without marks and empty text", () => {
    expect(splitMarks("plain")).toEqual([{ text: "plain", match: false }]);
    expect(splitMarks("")).toEqual([]);
  });

  it("strips marks", () => {
    expect(stripMarks(`a ${marked("b")} c`)).toBe("a b c");
  });
});
