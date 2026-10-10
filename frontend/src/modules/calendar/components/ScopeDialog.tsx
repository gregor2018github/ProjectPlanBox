import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { calendarUi, useCalendarUi } from "../uiStore";

/** Asks which events of a recurring series a change or delete applies to. */
export function ScopeDialog() {
  const question = useCalendarUi((s) => s.question);
  const deleting = question?.action === "delete";
  return (
    <Dialog
      open={question !== null}
      onOpenChange={(open) => {
        if (!open) calendarUi.answerScope(null);
      }}
      title={deleting ? "Delete recurring event" : "Change recurring event"}
      description={deleting ? "Which events do you want to delete?" : "Which events should change?"}
      size="sm"
    >
      <div className="flex flex-col gap-1 p-3">
        {question?.allowThis !== false && (
          <Button
            onClick={() => {
              calendarUi.answerScope("this");
            }}
            className="w-full justify-start"
          >
            This event
          </Button>
        )}
        <Button
          onClick={() => {
            calendarUi.answerScope("following");
          }}
          className="w-full justify-start"
        >
          This and following events
        </Button>
        <Button
          onClick={() => {
            calendarUi.answerScope("all");
          }}
          className="w-full justify-start"
        >
          All events
        </Button>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button
          variant="secondary"
          onClick={() => {
            calendarUi.answerScope(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
