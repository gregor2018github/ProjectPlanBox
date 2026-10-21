import type { IsoDate } from "../../core/time";
import type { ParsedTodo } from "./quickAddParser";
import type { Placement, Priority, RepeatFrom } from "./types";
import type { NewTodoInput } from "./useTodoActions";

/** What was picked with the buttons under a new todo's field. */
export interface NewTodoOptions {
  due_date: IsoDate | null;
  rrule: string | null;
  repeat_from: RepeatFrom;
  /** Null: not picked (the todo gets none). */
  priority: Priority | null;
  tag_ids: string[];
}

/** Nothing picked: the todo gets the view's defaults. */
export const NO_OPTIONS: NewTodoOptions = {
  due_date: null,
  rrule: null,
  repeat_from: "due",
  priority: null,
  tag_ids: [],
};

/**
 * The fields of a new todo from the typed text, the picked options and the
 * view's default due date. Typed parts win over picked ones, picked ones over
 * the default; tags add up. A repeat without a date starts on its first date
 * from today (the server picks it), not on the view's default.
 */
export function newTodoFields(
  parsed: ParsedTodo,
  options: NewTodoOptions,
  defaultDue: IsoDate | null,
  canRepeat: boolean,
): Omit<NewTodoInput, keyof Placement> {
  const typedRepeat = parsed.rrule !== null;
  const rrule = canRepeat ? (parsed.rrule ?? options.rrule) : null;
  return {
    title: parsed.title,
    due_date: parsed.due_date ?? options.due_date ?? (rrule === null ? defaultDue : null),
    priority: parsed.priority ?? options.priority ?? 0,
    tag_ids: [...new Set([...options.tag_ids, ...parsed.tag_ids])],
    new_tags: parsed.new_tags,
    ...(rrule !== null && {
      rrule,
      repeat_from: typedRepeat ? parsed.repeat_from : options.repeat_from,
    }),
  };
}
