import { describe, expect, it } from "vitest";

import { newTodoFields, NO_OPTIONS } from "./newTodoOptions";
import { parseQuickAdd, type ParseContext } from "./quickAddParser";

// Thursday, 8 October 2026.
const ctx: ParseContext = {
  today: "2026-10-08",
  lists: [],
  sections: [],
  tags: [
    { id: "money", name: "Money" },
    { id: "home", name: "Home" },
  ],
};

const parse = (text: string) => parseQuickAdd(text, ctx);

describe("newTodoFields", () => {
  it("uses the view's defaults when nothing is typed or picked", () => {
    expect(newTodoFields(parse("Call mum"), NO_OPTIONS, "2026-10-08", true)).toEqual({
      title: "Call mum",
      due_date: "2026-10-08",
      priority: 0,
      tag_ids: [],
      new_tags: [],
    });
  });

  it("uses picked options over the defaults", () => {
    const options = {
      ...NO_OPTIONS,
      due_date: "2026-10-20",
      priority: 2 as const,
      tag_ids: ["home"],
      rrule: "FREQ=WEEKLY",
    };
    expect(newTodoFields(parse("Call mum"), options, "2026-10-08", true)).toEqual({
      title: "Call mum",
      due_date: "2026-10-20",
      priority: 2,
      tag_ids: ["home"],
      new_tags: [],
      rrule: "FREQ=WEEKLY",
      repeat_from: "due",
    });
  });

  it("lets typed parts win over picked ones, and adds up tags", () => {
    const options = {
      ...NO_OPTIONS,
      due_date: "2026-10-20",
      priority: 1 as const,
      tag_ids: ["home"],
      rrule: "FREQ=MONTHLY",
    };
    expect(
      newTodoFields(parse("Pay rent fri !1 @money every week"), options, null, true),
    ).toMatchObject({
      title: "Pay rent",
      due_date: "2026-10-09",
      priority: 3,
      tag_ids: ["home", "money"],
      rrule: "FREQ=WEEKLY",
    });
  });

  it("leaves a picked repeat without a date to start on its first date", () => {
    const options = { ...NO_OPTIONS, rrule: "FREQ=WEEKLY;BYDAY=MO", repeat_from: "due" as const };
    expect(newTodoFields(parse("Bins"), options, "2026-10-08", true)).toMatchObject({
      due_date: null,
      rrule: "FREQ=WEEKLY;BYDAY=MO",
    });
  });

  it("drops the repeat for subtasks", () => {
    const options = { ...NO_OPTIONS, rrule: "FREQ=DAILY" };
    const fields = newTodoFields(parse("Step"), options, null, false);
    expect(fields).not.toHaveProperty("rrule");
    expect(fields.due_date).toBeNull();
  });
});
