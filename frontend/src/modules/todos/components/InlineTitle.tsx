import { useState, type KeyboardEvent } from "react";

import { cx } from "../../../ui/cx";

/** Props for {@link InlineTitle}. */
export interface InlineTitleProps {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  /** Larger text for the detail panel's main title. */
  size?: "base" | "lg";
  className?: string | undefined;
}

/**
 * Text that edits in place: saves on Enter or blur, Esc reverts. Follows
 * outside changes while not being edited.
 */
export function InlineTitle({
  value,
  label,
  onCommit,
  size = "base",
  className,
}: InlineTitleProps) {
  const [draft, setDraft] = useState(value);
  const [source, setSource] = useState(value);
  const [editing, setEditing] = useState(false);
  // Follow outside changes unless the user is editing.
  if (value !== source && !editing) {
    setSource(value);
    setDraft(value);
  }

  const commit = () => {
    setEditing(false);
    const cleaned = draft.replace(/\s+/g, " ").trim();
    if (cleaned === "") setDraft(value);
    else if (cleaned !== value) onCommit(cleaned);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDraft(value);
      setEditing(false);
      event.currentTarget.blur();
    }
  };

  return (
    <input
      aria-label={label}
      value={draft}
      onFocus={() => {
        setEditing(true);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={cx(
        "min-w-0 flex-1 rounded-sm bg-transparent text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
        size === "lg" ? "text-lg font-semibold" : "text-base",
        className,
      )}
    />
  );
}
