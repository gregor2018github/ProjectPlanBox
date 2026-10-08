import { useRef } from "react";

import { useShutdown } from "../core/api/coreQueries";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/useToast";

/** Props for {@link ShutdownDialog}. */
export interface ShutdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the server has acknowledged and is stopping. */
  onStopped: () => void;
}

/** Confirms stopping PlanBox, because it cannot be undone from the app. */
export function ShutdownDialog({ open, onOpenChange, onStopped }: ShutdownDialogProps) {
  const shutdown = useShutdown();
  const { show } = useToast();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = () => {
    shutdown.mutate(undefined, {
      onSuccess: () => {
        onOpenChange(false);
        onStopped();
      },
      onError: (error) => {
        show({ title: "Could not shut down", description: error.message, tone: "error" });
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Shut down PlanBox?"
      description="The server stops and this tab disconnects. Everything is already saved."
      size="sm"
      initialFocus={cancelRef}
    >
      <div className="flex justify-end gap-2 px-5 pt-4 pb-5">
        <Button
          ref={cancelRef}
          variant="secondary"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={shutdown.isPending}>
          {shutdown.isPending ? "Shutting down…" : "Shut down"}
        </Button>
      </div>
    </Dialog>
  );
}
