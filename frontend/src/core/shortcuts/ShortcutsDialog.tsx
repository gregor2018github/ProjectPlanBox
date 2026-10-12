import { useRef, useState } from "react";

import { Dialog } from "../../ui/Dialog";
import { Input } from "../../ui/Input";
import { Kbd } from "../../ui/Kbd";
import { filterShortcuts } from "./overview";
import { useShortcutList } from "./useShortcut";

/** Props for {@link ShortcutsDialog}. */
export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The "?" overview of every registered shortcut, grouped, with a filter field on top. */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const shortcuts = filterShortcuts(
    useShortcutList().filter((s) => s.hidden !== true),
    query,
  );
  const groups = [...new Set(shortcuts.map((s) => s.group))];

  const handleOpenChange = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Keyboard shortcuts"
      size="md"
      initialFocus={inputRef}
    >
      <div className="px-5 pt-3">
        <Input
          ref={inputRef}
          type="search"
          aria-label="Search shortcuts"
          placeholder="Search shortcuts…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </div>
      <div className="overflow-y-auto px-5 pt-2 pb-5">
        {groups.map((group) => (
          <section key={group} className="mt-4 first:mt-2">
            <h3 className="mb-1 text-xs font-medium text-text-muted">{group}</h3>
            <dl>
              {shortcuts
                .filter((s) => s.group === group)
                .map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-4 py-1.5">
                    <dt className="text-base">{s.description}</dt>
                    <dd>
                      <Kbd keys={s.keys} />
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
        {shortcuts.length === 0 && (
          <p className="py-6 text-center text-sm text-text-muted">No shortcut matches.</p>
        )}
      </div>
    </Dialog>
  );
}
