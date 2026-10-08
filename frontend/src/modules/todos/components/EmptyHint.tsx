import { Kbd } from "../../../ui/Kbd";

/** Props for {@link EmptyHint}. */
export interface EmptyHintProps {
  text: string;
}

/** One quiet sentence for an empty view, plus the quick-add hint. */
export function EmptyHint({ text }: EmptyHintProps) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 px-3 py-6 text-base text-text-muted">
      {text} Press <Kbd keys="Q" /> to add a todo.
    </p>
  );
}
