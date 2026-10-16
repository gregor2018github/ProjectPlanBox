/** The todos module on the device: the twin of `backend/planbox/modules/todos/__init__.py`. */
import type { ActivityEvent } from "../../../core/device/entities";
import type { DeviceModule } from "../../../core/device/server";
import { summarizeTodos, todoActivityRows, todoSearchRows } from "./repository";
import { todoHandlers } from "./routes";
import { ENTITY_TYPE } from "./service";

/** Areas, lists, sections, todos and subtasks. */
export const todosDevice: DeviceModule = {
  id: "todos",
  migrations: {
    owner: "todos",
    files: import.meta.glob<string>(
      "../../../../../backend/planbox/modules/todos/migrations/*.sql",
      {
        query: "?raw",
        import: "default",
        eager: true,
      },
    ),
  },
  entityTypes: [
    {
      name: ENTITY_TYPE,
      summarize: (db, ids) =>
        new Map(
          [...summarizeTodos(db, ids)].map(([id, [title, deleted, hint]]) => [
            id,
            { title, deleted, hint },
          ]),
        ),
      documents: (db, since) =>
        todoSearchRows(db, since).map(([id, title, body, deleted, updatedAt]) => ({
          id,
          title,
          body,
          deleted,
          updatedAt,
        })),
      activity: (db, window) => {
        // The next occurrence a repeating todo makes itself was not added by anyone.
        const events: ActivityEvent[] = [];
        for (const [createdAt, completedAt, deletedAt, spawned] of todoActivityRows(
          db,
          window.since,
        )) {
          if (!spawned) events.push({ action: "created", at: createdAt });
          if (completedAt !== null) events.push({ action: "completed", at: completedAt });
          if (deletedAt !== null) events.push({ action: "deleted", at: deletedAt });
        }
        return events;
      },
    },
  ],
  handlers: todoHandlers,
};
