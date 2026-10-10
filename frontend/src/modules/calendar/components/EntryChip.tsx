import { Checkbox } from "../../../ui/Checkbox";
import { cx } from "../../../ui/cx";
import type { EntryItem } from "../types";
import type { CalendarActions } from "../useCalendarActions";
import { useItemDrag } from "../useItemDrag";

/** Props for {@link EntryChip}. */
export interface EntryChipProps {
  item: EntryItem;
  surface: string;
  actions: CalendarActions;
  /** Agenda rows are roomier and show the context (e.g. the list). */
  roomy?: boolean;
}

/**
 * Another module's dated item (a todo): tick it off, open it in the detail
 * panel, or drag it to another day to reschedule it.
 */
export function EntryChip({ item, surface, actions, roomy = false }: EntryChipProps) {
  const { ref, isDragging } = useItemDrag(surface, item, actions);
  const { entry } = item;
  return (
    <div
      ref={ref}
      className={cx(
        "flex min-w-0 touch-manipulation items-center gap-2 rounded-sm transition-colors duration-(--duration-fast) ease-out hover:bg-hover",
        roomy ? "px-2 py-1.5 coarse:min-h-11" : "h-6 px-1.5",
        isDragging && "opacity-50",
      )}
    >
      <Checkbox
        size="sm"
        checked={entry.done}
        tone={entry.tone}
        label={`${entry.done ? "Reopen" : "Complete"} “${entry.title}”`}
        onCheckedChange={() => {
          actions.toggleEntry(item);
        }}
      />
      <button
        type="button"
        onClick={() => {
          actions.openEntry(item);
        }}
        className={cx(
          "flex min-w-0 flex-1 items-baseline gap-2 text-left",
          roomy ? "text-base" : "text-xs",
        )}
      >
        <span className={cx("truncate", entry.done && "text-text-muted line-through")}>
          {entry.title}
        </span>
        {roomy && entry.context !== undefined && (
          <span className="shrink-0 truncate text-sm text-text-muted">{entry.context}</span>
        )}
      </button>
    </div>
  );
}
