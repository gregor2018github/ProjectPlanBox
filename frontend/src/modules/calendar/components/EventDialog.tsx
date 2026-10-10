import { Clock, MapPin } from "lucide-react";
import { useState, type SyntheticEvent } from "react";

import { formatMinutes, parseMinutes } from "../../../core/time";
import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { Input } from "../../../ui/Input";
import { Switch } from "../../../ui/Switch";
import { TextArea } from "../../../ui/TextArea";
import { changedText, draftFromItem, draftTiming, withStart, type EventDraft } from "../draft";
import { repeatOf, ruleOf, type Repeat } from "../../../core/recurrence/recurrence";
import { occurrenceTiming, sameTiming } from "../timing";
import type { EditorState } from "../uiStore";
import type { CalendarActions, EventChange } from "../useCalendarActions";
import { RecurrenceFields } from "../../../core/recurrence/RecurrenceFields";

/** Props for {@link EventDialog}. */
export interface EventDialogProps {
  editor: EditorState;
  actions: CalendarActions;
  onClose: () => void;
}

/**
 * Creates or edits an event: title, all-day or times, repeat rule, location
 * and notes. For a recurring event it edits one occurrence; saving asks
 * which events the change applies to.
 */
export function EventDialog({ editor, actions, onClose }: EventDialogProps) {
  const timeZone = actions.timeZone;
  const [initial] = useState<EventDraft>(() =>
    editor.mode === "new" ? editor.draft : draftFromItem(editor.item, timeZone),
  );
  const [draft, setDraft] = useState(initial);
  const [repeat, setRepeat] = useState<Repeat>(() =>
    repeatOf(initial.rrule, initial.startDate, timeZone),
  );
  const [repeatTouched, setRepeatTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = editor.mode === "edit";

  const update = (patch: Partial<EventDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const title = draft.title.trim();
    if (title === "") return;
    const timing = draftTiming(draft, timeZone);
    if (typeof timing === "string") {
      setError(timing);
      return;
    }
    const rrule = repeatTouched ? ruleOf(repeat, draft.startDate) : initial.rrule;
    onClose();
    if (editor.mode === "new") {
      actions.create(timing, { title, location: draft.location.trim(), notes: draft.notes }, rrule);
      return;
    }
    const item = editor.item;
    const text = changedText(initial, { ...draft, title, location: draft.location.trim() });
    const change: EventChange = {
      ...(Object.keys(text).length > 0 && { text }),
      ...(!sameTiming(timing, occurrenceTiming(item.event, item.occurrence)) && { timing }),
      ...(repeatTouched && rrule !== item.event.rrule && { rrule }),
    };
    if (Object.keys(change).length > 0) void actions.change(item, change);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={editing ? "Edit event" : "New event"}
      hideTitle
      placement="top"
      size="md"
    >
      <form onSubmit={submit} className="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pt-5 pb-4">
          <Input
            aria-label="Title"
            placeholder="Add title"
            value={draft.title}
            onChange={(event) => {
              update({ title: event.target.value });
            }}
            variant="plain"
            className="pr-10 text-lg font-medium"
          />

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Clock
                size={16}
                strokeWidth={1.75}
                aria-hidden
                className="shrink-0 text-text-muted"
              />
              <Switch
                label="All day"
                checked={draft.allDay}
                onCheckedChange={(allDay) => {
                  update({ allDay });
                }}
              />
            </div>
            <div className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 pl-6 text-sm text-text-muted">
              <span>Starts</span>
              <Input
                type="date"
                aria-label="Start date"
                value={draft.startDate}
                onChange={(event) => {
                  if (event.target.value)
                    setDraft(withStart(draft, event.target.value, draft.startMinutes));
                }}
              />
              {draft.allDay ? (
                <span />
              ) : (
                <Input
                  type="time"
                  step={300}
                  aria-label="Start time"
                  value={formatMinutes(draft.startMinutes)}
                  onChange={(event) => {
                    const minutes = parseMinutes(event.target.value);
                    if (minutes !== null) setDraft(withStart(draft, draft.startDate, minutes));
                  }}
                  className="w-28"
                />
              )}
              <span>Ends</span>
              <Input
                type="date"
                aria-label="End date"
                value={draft.endDate}
                min={draft.startDate}
                onChange={(event) => {
                  if (event.target.value) update({ endDate: event.target.value });
                }}
              />
              {draft.allDay ? (
                <span />
              ) : (
                <Input
                  type="time"
                  step={300}
                  aria-label="End time"
                  value={formatMinutes(draft.endMinutes)}
                  onChange={(event) => {
                    const minutes = parseMinutes(event.target.value);
                    if (minutes !== null) update({ endMinutes: minutes });
                  }}
                  className="w-28"
                />
              )}
            </div>
          </div>

          <RecurrenceFields
            value={repeat}
            start={draft.startDate}
            timeZone={timeZone}
            onChange={(next) => {
              setRepeat(next);
              setRepeatTouched(true);
            }}
          />

          <div className="flex items-center gap-2">
            <MapPin size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
            <Input
              aria-label="Location"
              placeholder="Add location"
              value={draft.location}
              onChange={(event) => {
                update({ location: event.target.value });
              }}
            />
          </div>
          <TextArea
            aria-label="Notes"
            placeholder="Notes"
            value={draft.notes}
            onChange={(event) => {
              update({ notes: event.target.value });
            }}
          />
          {error !== null && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-5 py-3">
          {editor.mode === "edit" && (
            <Button
              onClick={() => {
                onClose();
                void actions.remove(editor.item);
              }}
            >
              Delete
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={draft.title.trim() === ""}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
