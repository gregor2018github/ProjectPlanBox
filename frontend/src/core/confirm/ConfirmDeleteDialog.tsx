import { useRef } from "react";

import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { deleteConfirmation, usePendingDelete } from "./confirmDelete";

/** Asks "Delete …?" for {@link confirmDelete} on touch screens. Mounted once by the shell. */
export function ConfirmDeleteDialog() {
  const question = usePendingDelete();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={question !== null}
      onOpenChange={(open) => {
        if (!open) deleteConfirmation.dismiss();
      }}
      title={question?.title ?? "Delete?"}
      description={question?.description}
      size="sm"
      initialFocus={cancelRef}
    >
      <div className="flex justify-end gap-2 px-5 pt-4 pb-5">
        <Button
          ref={cancelRef}
          variant="secondary"
          onClick={() => {
            deleteConfirmation.dismiss();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            deleteConfirmation.accept();
          }}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
