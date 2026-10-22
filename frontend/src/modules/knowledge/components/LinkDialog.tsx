import { useRef, useState, type SubmitEvent } from "react";

import { Button } from "../../../ui/Button";
import { Dialog } from "../../../ui/Dialog";
import { Input } from "../../../ui/Input";
import { linkTarget } from "../pageEditor";

/** Props for {@link LinkDialog}. */
export interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The link's current address, or "" for a new one. */
  initial: string;
  /** Sets the link (an http(s) or mailto address). */
  onSubmit: (href: string) => void;
  /** Removes the link (shown when there is one). */
  onRemove: () => void;
}

/**
 * Asks for a link's address. A bare address gets https://, an e-mail address
 * mailto:; anything else that is not http(s) or mailto cannot be saved.
 */
export function LinkDialog({ open, onOpenChange, initial, onSubmit, onRemove }: LinkDialogProps) {
  const [address, setAddress] = useState(initial);
  const [wasOpen, setWasOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setAddress(initial);
  }
  const target = linkTarget(address);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (target === null) return;
    onSubmit(target);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Link" size="sm" initialFocus={inputRef}>
      <form onSubmit={submit} className="flex flex-col gap-4 px-5 pt-3 pb-5">
        <Input
          ref={inputRef}
          aria-label="Web address"
          placeholder="https://…"
          inputMode="url"
          value={address}
          maxLength={2000}
          onChange={(event) => {
            setAddress(event.target.value);
          }}
        />
        <div className="flex justify-end gap-2">
          {initial !== "" && (
            <Button
              variant="secondary"
              className="mr-auto text-danger"
              onClick={() => {
                onRemove();
                onOpenChange(false);
              }}
            >
              Remove link
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={target === null}>
            Set link
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
