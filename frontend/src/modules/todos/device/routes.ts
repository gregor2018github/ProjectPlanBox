/** `/api/todos` on the device: the twin of `backend/planbox/modules/todos/router.py`. */
import type { components } from "../../../core/api/schema";
import { changesOf } from "../../../core/device/common";
import { ValidationFailed } from "../../../core/device/errors";
import { Answer, type DeviceContext, type Handlers } from "../../../core/device/server";
import { dateDay, isoDate, parseInstant, toIso } from "../../../core/device/time";
import type { Area, Section, TodoList } from "./repository";
import { AreaService, ListService, SectionService, TodoService, type TodoRecord } from "./service";

type TodoOut = components["schemas"]["TodoOut"];

function areaOut(a: Area) {
  return {
    id: a.id,
    name: a.name,
    hue: a.hue,
    position: a.position,
    created_at: a.created_at,
    updated_at: a.updated_at,
  };
}

function listOut(l: TodoList) {
  return {
    id: l.id,
    area_id: l.area_id,
    name: l.name,
    position: l.position,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
}

function sectionOut(s: Section) {
  return {
    id: s.id,
    list_id: s.list_id,
    name: s.name,
    position: s.position,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

function todoOut({ todo: t, tagIds }: TodoRecord): TodoOut {
  return {
    id: t.id,
    list_id: t.list_id,
    section_id: t.section_id,
    parent_id: t.parent_id,
    title: t.title,
    notes: t.notes,
    priority: t.priority,
    due_date: t.due_date,
    position: t.position,
    completed_at: t.completed_at,
    created_at: t.created_at,
    updated_at: t.updated_at,
    tag_ids: tagIds,
    rrule: t.rrule,
    recurrence_anchor: t.recurrence_anchor,
    repeat_from: t.repeat_from === "completion" ? "completion" : "due",
    today_position: t.today_position,
    rank_position: t.rank_position,
    today_rank_position: t.today_rank_position,
  };
}

const many = (records: TodoRecord[]) => ({ todos: records.map(todoOut) });
const created = <T>(body: T, isNew: boolean) => (isNew ? body : new Answer(body, 200));

const areas = (ctx: DeviceContext) => new AreaService(ctx.db, ctx.clock);
const lists = (ctx: DeviceContext) => new ListService(ctx.db, ctx.clock);
const sections = (ctx: DeviceContext) => new SectionService(ctx.db, ctx.clock);
const todos = (ctx: DeviceContext) => new TodoService(ctx.db, ctx.clock, ctx.zone);

/** Handlers of the todos module. */
export const todoHandlers: Handlers = {
  todos_list_areas: (_, ctx) => areas(ctx).listLive().map(areaOut),
  todos_create_area: ({ body }, ctx) => {
    const [area, isNew] = areas(ctx).create(body.name, body.id ?? null, body.hue ?? null);
    return created(areaOut(area), isNew);
  },
  todos_update_area: ({ path, body }, ctx) =>
    areaOut(areas(ctx).update(path.area_id, body.name ?? null, body.hue ?? null)),
  todos_move_area: ({ path, body }, ctx) =>
    areaOut(areas(ctx).move(path.area_id, body.before_id ?? null, body.after_id ?? null)),
  todos_delete_area: ({ path }, ctx) => areas(ctx).delete(path.area_id),
  todos_restore_area: ({ path }, ctx) => areas(ctx).restore(path.area_id),

  todos_list_lists: (_, ctx) => lists(ctx).listLive().map(listOut),
  todos_create_list: ({ body }, ctx) => {
    const [list, isNew] = lists(ctx).create(body.name, body.area_id ?? null, body.id ?? null);
    return created(listOut(list), isNew);
  },
  todos_rename_list: ({ path, body }, ctx) => listOut(lists(ctx).rename(path.list_id, body.name)),
  todos_move_list: ({ path, body }, ctx) =>
    listOut(
      lists(ctx).move(
        path.list_id,
        body.area_id ?? null,
        body.before_id ?? null,
        body.after_id ?? null,
      ),
    ),
  todos_delete_list: ({ path }, ctx) => lists(ctx).delete(path.list_id),
  todos_restore_list: ({ path }, ctx) => lists(ctx).restore(path.list_id),

  todos_list_sections: (_, ctx) => sections(ctx).listLive().map(sectionOut),
  todos_create_section: ({ body }, ctx) => {
    const [section, isNew] = sections(ctx).create(
      body.list_id,
      body.name,
      body.id ?? null,
      body.before_id ?? null,
      body.after_id ?? null,
    );
    return created(sectionOut(section), isNew);
  },
  todos_rename_section: ({ path, body }, ctx) =>
    sectionOut(sections(ctx).rename(path.section_id, body.name)),
  todos_move_section: ({ path, body }, ctx) =>
    sectionOut(
      sections(ctx).move(
        path.section_id,
        body.list_id,
        body.before_id ?? null,
        body.after_id ?? null,
      ),
    ),
  todos_delete_section: ({ path }, ctx) => sections(ctx).delete(path.section_id),
  todos_restore_section: ({ path }, ctx) => sections(ctx).restore(path.section_id),

  todos_list_items: ({ query }, ctx) => {
    const parsed = parseInstant(query.completed_since);
    if (!parsed?.aware) {
      throw new ValidationFailed("completed_since needs a timezone (use UTC, e.g. ...Z).");
    }
    return todos(ctx).current(toIso(parsed.ms)).map(todoOut);
  },
  todos_list_completed_items: ({ query }, ctx) => {
    const page = todos(ctx).logbook(query.cursor ?? null, query.limit ?? 50);
    return { todos: page.records.map(todoOut), next_cursor: page.nextCursor };
  },
  todos_forecast: ({ query }, ctx) =>
    todos(ctx)
      .forecast(dateDay(query.start), dateDay(query.end))
      .map((f) => ({ todo_id: f.todoId, date: isoDate(f.date) })),
  todos_get_stats: (_, ctx) => todos(ctx).stats(),
  todos_get_item: ({ path }, ctx) => todoOut(todos(ctx).get(path.todo_id)),
  todos_create_item: ({ body }, ctx) => {
    const [record, isNew] = todos(ctx).create({
      id: body.id ?? null,
      title: body.title,
      notes: body.notes ?? "",
      priority: body.priority ?? 0,
      dueDate: body.due_date ?? null,
      placement: {
        listId: body.list_id ?? null,
        sectionId: body.section_id ?? null,
        parentId: body.parent_id ?? null,
      },
      tagIds: body.tag_ids ?? [],
      beforeId: body.before_id ?? null,
      afterId: body.after_id ?? null,
      rrule: body.rrule ?? null,
      repeatFrom: body.repeat_from ?? "due",
    });
    return created(todoOut(record), isNew);
  },
  todos_update_item: ({ path, body, fields }, ctx) =>
    todoOut(todos(ctx).update(path.todo_id, changesOf(body, fields))),
  todos_complete_item: ({ path }, ctx) => many(todos(ctx).complete(path.todo_id)),
  todos_reopen_item: ({ path }, ctx) => many(todos(ctx).reopen(path.todo_id)),
  todos_skip_item: ({ path }, ctx) => todoOut(todos(ctx).skip(path.todo_id)),
  todos_move_item: ({ path, body }, ctx) =>
    many(
      todos(ctx).move(
        path.todo_id,
        {
          listId: body.list_id ?? null,
          sectionId: body.section_id ?? null,
          parentId: body.parent_id ?? null,
        },
        body.before_id ?? null,
        body.after_id ?? null,
      ),
    ),
  todos_set_today_order: ({ body }, ctx) => many(todos(ctx).setTodayOrder(body.ids)),
  todos_set_rank_order: ({ body }, ctx) =>
    many(todos(ctx).setRankOrder(body.ids, body.unranked ?? [], body.scope ?? "all")),
  todos_delete_item: ({ path }, ctx) => todos(ctx).delete(path.todo_id),
  todos_restore_item: ({ path }, ctx) => many(todos(ctx).restore(path.todo_id)),
};
