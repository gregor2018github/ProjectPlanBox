import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

import { useCommands } from "../../../core/commands/commandsContext";
import type { Command } from "../../../core/commands/registry";
import { useShortcut } from "../../../core/shortcuts/useShortcut";
import { useToday } from "../../../core/useToday";
import { newTimedDraft } from "../draft";
import { CALENDAR_PATH } from "../paths";
import { calendarUi, useCalendarUi } from "../uiStore";
import { useCalendarActions } from "../useCalendarActions";
import { useNow } from "../useNow";
import { EventDialog } from "./EventDialog";
import { ScopeDialog } from "./ScopeDialog";

/**
 * Mounted once for the app's lifetime: the module's shortcuts and palette
 * commands, the event dialog and the "which events?" question.
 */
export function CalendarHost() {
  const actions = useCalendarActions();
  const navigate = useNavigate();
  const today = useToday();
  const now = useNow(actions.timeZone);
  const editor = useCalendarUi((s) => s.editor);
  const editorSeq = useCalendarUi((s) => s.editorSeq);

  const openNew = () => {
    actions.openNew(newTimedDraft(today ?? now.date, now));
  };
  const goToCalendar = () => {
    void navigate({ to: CALENDAR_PATH });
  };

  useShortcut({
    id: "calendar.new",
    keys: "N",
    description: "New event",
    group: "Calendar",
    run: openNew,
  });
  useShortcut({
    id: "calendar.go",
    keys: "G C",
    description: "Go to Calendar",
    group: "Navigation",
    run: goToCalendar,
  });

  const commands = useMemo<Command[]>(
    () => [
      {
        id: "calendar.new",
        title: "New event",
        group: "Calendar",
        keywords: ["add", "create", "appointment", "meeting"],
        shortcut: "N",
        run: openNew,
      },
      {
        id: "calendar.go",
        title: "Go to Calendar",
        group: "Navigation",
        keywords: ["month", "week", "schedule"],
        shortcut: "G C",
        run: goToCalendar,
      },
    ],
    // openNew/goToCalendar read fresh state through closures over these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actions, navigate, today, now],
  );
  useCommands(commands);

  return (
    <>
      {editor && (
        <EventDialog
          key={editorSeq}
          editor={editor}
          actions={actions}
          onClose={() => {
            calendarUi.closeEditor();
          }}
        />
      )}
      <ScopeDialog />
    </>
  );
}
