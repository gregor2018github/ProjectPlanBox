/** Builders for todo test data. */
import type { Section, Todo } from "./types";

let counter = 0;

/** A todo with sensible defaults; override what the test cares about. */
export function makeTodo(overrides: Partial<Todo> = {}): Todo {
  counter += 1;
  return {
    id: `t${String(counter).padStart(3, "0")}`,
    list_id: null,
    section_id: null,
    parent_id: null,
    title: `Todo ${counter}`,
    notes: "",
    priority: 0,
    due_date: null,
    position: `a${counter}`,
    completed_at: null,
    created_at: "2026-10-08T08:00:00.000Z",
    updated_at: "2026-10-08T08:00:00.000Z",
    tag_ids: [],
    rrule: null,
    recurrence_anchor: null,
    today_position: null,
    ...overrides,
  };
}

/** A section with defaults. */
export function makeSection(overrides: Partial<Section> & Pick<Section, "list_id">): Section {
  counter += 1;
  return {
    id: `s${counter}`,
    name: `Section ${counter}`,
    position: `a${counter}`,
    created_at: "2026-10-08T08:00:00.000Z",
    updated_at: "2026-10-08T08:00:00.000Z",
    ...overrides,
  };
}
