import { useNavigate } from "@tanstack/react-router";
import { Maximize2, Plus, X } from "lucide-react";

import type { RailPaneProps } from "../../../core/module";
import { IconButton } from "../../../ui/IconButton";
import { newHabitDialog } from "../newHabitStore";
import { HABITS_PATH } from "../paths";
import { useHabitData } from "../queries";
import { useHabitActions } from "../useHabitActions";
import { TodayHabitRow } from "./TodayHabitRow";

/** The habits rail pane: today's habits to tick off, then the rest. */
export function HabitsPane({ onClose }: RailPaneProps) {
  const { habits, today, loading } = useHabitData();
  const actions = useHabitActions();
  const navigate = useNavigate();
  const due = today === null ? [] : habits.filter((h) => h.scheduled.includes(today));
  const others = today === null ? [] : habits.filter((h) => !h.scheduled.includes(today));

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 px-3">
        <h2 className="flex-1 pl-1 text-base font-semibold">Habits</h2>
        <IconButton label="New habit" icon={Plus} onClick={newHabitDialog.open} />
        <IconButton
          label="Open habits page"
          icon={Maximize2}
          shortcut="G B"
          onClick={() => {
            onClose();
            void navigate({ to: HABITS_PATH });
          }}
        />
        <IconButton label="Close habits" icon={X} shortcut="H" onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        {today !== null && (
          <>
            <h3 className="px-3 pt-1 pb-1 text-xs font-medium text-text-muted">Today</h3>
            {due.length > 0 ? (
              <ul aria-label="Today's habits" className="flex flex-col">
                {due.map((h) => (
                  <TodayHabitRow key={h.id} habit={h} today={today} actions={actions} />
                ))}
              </ul>
            ) : (
              <p className="px-3 py-2 text-sm text-text-muted">
                {loading ? "" : "Nothing scheduled today."}
              </p>
            )}
            {others.length > 0 && (
              <>
                <h3 className="px-3 pt-4 pb-1 text-xs font-medium text-text-muted">
                  Not scheduled today
                </h3>
                <ul aria-label="Other habits" className="flex flex-col">
                  {others.map((h) => (
                    <TodayHabitRow key={h.id} habit={h} today={today} actions={actions} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
