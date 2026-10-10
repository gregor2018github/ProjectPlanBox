import { useRef, useState, type SubmitEvent } from "react";

import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Input } from "./Input";

/** Props for {@link NameDialog}. */
export interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** The current name when renaming. */
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
}

/** Asks for a name (e.g. a new list or collection, or a rename). */
export function NameDialog({
  open,
  onOpenChange,
  title,
  initial = "",
  submitLabel,
  onSubmit,
}: NameDialogProps) {
  const [name, setName] = useState(initial);
  const [wasOpen, setWasOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);
  // Start from the current name every time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName(initial);
  }

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    onSubmit(name.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} size="sm" initialFocus={inputRef}>
      <form onSubmit={submit} className="flex flex-col gap-4 px-5 pt-3 pb-5">
        <Input
          ref={inputRef}
          aria-label="Name"
          value={name}
          maxLength={200}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={name.trim() === ""}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
