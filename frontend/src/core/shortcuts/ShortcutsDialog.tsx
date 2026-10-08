import { Dialog } from "../../ui/Dialog";
import { Kbd } from "../../ui/Kbd";
import { useShortcutList } from "./useShortcut";

/** Props for {@link ShortcutsDialog}. */
export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The "?" overview of every registered shortcut, grouped. */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const shortcuts = useShortcutList().filter((s) => s.hidden !== true);
  const groups = [...new Set(shortcuts.map((s) => s.group))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" size="md">
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
      </div>
    </Dialog>
  );
}
