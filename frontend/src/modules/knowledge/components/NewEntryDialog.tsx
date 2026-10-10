import { useRef, useState, type KeyboardEvent, type SubmitEvent } from "react";

import { Button } from "../../../ui/Button";
import { cx } from "../../../ui/cx";
import { Dialog } from "../../../ui/Dialog";
import { Input } from "../../../ui/Input";
import { SegmentedControl, type SegmentOption } from "../../../ui/SegmentedControl";
import { TextArea } from "../../../ui/TextArea";
import type { CreateEntryVars } from "../apply";
import { KIND_ICONS } from "../kindIcons";
import { hostOf, isWebUrl, normalizeUrl } from "../selectors";
import { ENTRY_KINDS, KIND_LABELS, type EntryKind } from "../types";

/** Props for {@link NewEntryDialog}. */
export interface NewEntryDialogProps {
  /** The kind to start with; null keeps the dialog closed. */
  initialKind: EntryKind | null;
  onClose: () => void;
  /** Where the entry goes (null = Unsorted) and how to name that place. */
  collectionId: string | null;
  collectionLabel: string;
  onCreate: (input: Omit<CreateEntryVars, "id">) => void;
}

const KIND_OPTIONS: readonly SegmentOption<EntryKind>[] = ENTRY_KINDS.map((kind) => ({
  value: kind,
  label: KIND_LABELS[kind],
  icon: KIND_ICONS[kind],
}));

const BODY_LABELS: Record<EntryKind, string> = {
  note: "Text",
  link: "Description",
  snippet: "Code",
};

/**
 * Creates a note, link or snippet. A link without a title is named after its
 * site. Enter in a field (or Ctrl+Enter in the text) saves.
 */
export function NewEntryDialog({
  initialKind,
  onClose,
  collectionId,
  collectionLabel,
  onCreate,
}: NewEntryDialogProps) {
  const open = initialKind !== null;
  const [kind, setKind] = useState<EntryKind>(initialKind ?? "note");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [body, setBody] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const titleRef = useRef<HTMLInputElement>(null);
  // Start from a blank form every time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(initialKind);
      setTitle("");
      setUrl("");
      setLanguage("");
      setBody("");
    }
  }

  const address = normalizeUrl(url);
  const effectiveTitle = title.trim() || (kind === "link" ? (hostOf(address) ?? "") : "");
  const canSave = effectiveTitle !== "" && (kind !== "link" || isWebUrl(address));

  const submit = (event?: SubmitEvent) => {
    event?.preventDefault();
    if (!canSave) return;
    onCreate({
      kind,
      title: effectiveTitle,
      body,
      collection_id: collectionId,
      ...(kind === "link" && { url: address }),
      ...(kind === "snippet" && { language: language.trim() || null }),
    });
    onClose();
  };

  const onBodyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && event.ctrlKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`New ${KIND_LABELS[kind].toLowerCase()}`}
      description={`Goes to ${collectionLabel}.`}
      size="md"
      initialFocus={titleRef}
    >
      <form onSubmit={submit} className="flex flex-col gap-3 px-5 pt-3 pb-5">
        <SegmentedControl
          label="Kind"
          value={kind}
          onChange={(next) => {
            setKind(next);
            titleRef.current?.focus();
          }}
          options={KIND_OPTIONS}
        />
        {kind === "link" && (
          <Input
            aria-label="Web address"
            placeholder="https://…"
            inputMode="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
          />
        )}
        <Input
          ref={titleRef}
          aria-label="Title"
          placeholder={kind === "link" ? (hostOf(address) ?? "Title") : "Title"}
          maxLength={500}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        {kind === "snippet" && (
          <Input
            aria-label="Language"
            placeholder="Language (e.g. python, sql)"
            maxLength={40}
            value={language}
            onChange={(event) => {
              setLanguage(event.target.value);
            }}
          />
        )}
        <TextArea
          aria-label={BODY_LABELS[kind]}
          placeholder={BODY_LABELS[kind]}
          value={body}
          rows={kind === "note" ? 6 : 4}
          spellCheck={kind !== "snippet"}
          className={cx(kind === "snippet" && "font-mono")}
          onChange={(event) => {
            setBody(event.target.value);
          }}
          onKeyDown={onBodyKeyDown}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!canSave}>
            Add {KIND_LABELS[kind].toLowerCase()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
