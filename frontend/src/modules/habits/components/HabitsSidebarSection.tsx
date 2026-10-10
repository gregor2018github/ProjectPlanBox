import { Link } from "@tanstack/react-router";
import { Flame, Plus } from "lucide-react";

import { IconButton } from "../../../ui/IconButton";
import { isDueToday } from "../days";
import { newHabitDialog } from "../newHabitStore";
import { HABITS_PATH } from "../paths";
import { useHabitData } from "../queries";

/** The habits part of the sidebar: the Habits page, with how many are still due today. */
export function HabitsSidebarSection() {
  const { habits, today } = useHabitData();
  const due = today === null ? 0 : habits.filter((h) => isDueToday(h, today)).length;

  return (
    <>
      <div className="mt-4 flex items-center justify-between pl-2">
        <span className="text-xs font-medium text-text-muted">Habits</span>
        <IconButton label="New habit" icon={Plus} onClick={newHabitDialog.open} />
      </div>
      <Link
        to={HABITS_PATH}
        className="flex h-8 items-center gap-2 rounded-md px-2 text-base text-text transition-colors duration-(--duration-fast) ease-out hover:bg-hover data-[status=active]:bg-selected data-[status=active]:font-medium coarse:h-11"
      >
        <Flame size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
        <span className="flex-1 truncate">All habits</span>
        {due > 0 && (
          <span aria-label={`${due} due today`} className="text-sm text-text-muted tabular-nums">
            {due}
          </span>
        )}
      </Link>
    </>
  );
}
