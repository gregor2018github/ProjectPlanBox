import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";

/** Props for {@link Sheet}. */
export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible title (visually hidden). */
  title: string;
  children: ReactNode;
}

/** A modal panel that slides in from the left; the sidebar on small screens. */
export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-(--duration-slow) ease-out data-[ending-style]:opacity-0 data-[ending-style]:duration-(--duration-exit) data-[starting-style]:opacity-0" />
        <BaseDialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-lg outline-none transition-transform duration-(--duration-slow) ease-out data-[ending-style]:-translate-x-full data-[ending-style]:duration-(--duration-exit) data-[ending-style]:ease-in data-[starting-style]:-translate-x-full">
          <BaseDialog.Title className="sr-only">{title}</BaseDialog.Title>
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
