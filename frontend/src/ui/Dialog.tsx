import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode, RefObject } from "react";

import { cx } from "./cx";

/** Where the dialog sits: centred, or near the top (palette, quick-add). */
export type DialogPlacement = "center" | "top";

const widths = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

/** Props for {@link Dialog}. */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible title; shown unless `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  description?: string;
  placement?: DialogPlacement;
  size?: keyof typeof widths;
  /** Element to focus on open; defaults to the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/** A modal dialog: traps focus, closes on Esc and outside click, restores focus. */
export function Dialog({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  placement = "center",
  size = "md",
  initialFocus,
  children,
}: DialogProps) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-(--duration-slow) ease-out data-[ending-style]:opacity-0 data-[ending-style]:duration-(--duration-exit) data-[ending-style]:ease-in data-[starting-style]:opacity-0" />
        <BaseDialog.Viewport
          className={cx(
            "fixed inset-0 z-50 flex justify-center p-4",
            placement === "top" ? "items-start pt-16 md:pt-24" : "items-center",
          )}
        >
          <BaseDialog.Popup
            {...(initialFocus && { initialFocus })}
            className={cx(
              "flex max-h-full w-full flex-col overflow-hidden rounded-xl bg-surface-raised text-text shadow-lg outline-none transition-[opacity,transform] duration-(--duration-slow) ease-out data-[ending-style]:scale-98 data-[ending-style]:opacity-0 data-[ending-style]:duration-(--duration-exit) data-[ending-style]:ease-in data-[starting-style]:scale-97 data-[starting-style]:opacity-0 dark:inset-ring dark:inset-ring-border",
              widths[size],
            )}
          >
            <BaseDialog.Title className={hideTitle ? "sr-only" : "px-5 pt-4 text-lg font-semibold"}>
              {title}
            </BaseDialog.Title>
            {description !== undefined && (
              <BaseDialog.Description className="px-5 pt-1 text-sm text-text-muted">
                {description}
              </BaseDialog.Description>
            )}
            {children}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
