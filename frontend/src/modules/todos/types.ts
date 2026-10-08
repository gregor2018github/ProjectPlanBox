/** Aliases of the generated backend types for the todos module. */
import type { components } from "../../core/api/schema";

/** A todo or (with `parent_id`) a subtask; `list_id` null means Inbox. */
export type Todo = components["schemas"]["TodoOut"];

/** An area groups lists. */
export type Area = components["schemas"]["AreaOut"];

/** A list of todos. */
export type TodoList = components["schemas"]["ListOut"];

/** A heading inside a list. */
export type Section = components["schemas"]["SectionOut"];

/** What a cascading delete touched. */
export type Deleted = components["schemas"]["DeletedOut"];

/** Where a todo lives. */
export type Placement = Pick<Todo, "list_id" | "section_id" | "parent_id">;

/** Priority 0 (none) .. 3 (high). */
export type Priority = 0 | 1 | 2 | 3;

/** Human names of the priorities. */
export const PRIORITY_LABELS: Record<Priority, string> = {
  0: "No priority",
  1: "Low",
  2: "Medium",
  3: "High",
};

/** The Inbox: no list, no section, no parent. */
export const INBOX: Placement = { list_id: null, section_id: null, parent_id: null };
