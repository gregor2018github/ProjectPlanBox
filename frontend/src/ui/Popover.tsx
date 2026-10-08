import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ReactElement, ReactNode, RefObject } from "react";

import { cx } from "./cx";

/** Props for {@link Popover}. */
export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that toggles the popover (must accept props and a ref). */
  trigger: ReactElement;
  /** Accessible name of the popup. */
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
  initialFocus?: RefObject<HTMLElement | null>;
  /** Layout only (e.g. a width). */
  className?: string;
  children: ReactNode;
}

/** A floating panel anchored to its trigger; closes on Esc and outside click. */
export function Popover({
  open,
  onOpenChange,
  trigger,
  label,
  side = "bottom",
  align = "start",
  initialFocus,
  className,
  children,
}: PopoverProps) {
  return (
    <BasePopover.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="z-50"
        >
          <BasePopover.Popup
            aria-label={label}
            {...(initialFocus && { initialFocus })}
            className={cx(
              "max-h-(--available-height) overflow-auto rounded-lg bg-surface-raised text-text shadow-md outline-none transition-[opacity,transform] duration-(--duration-base) ease-out data-[ending-style]:opacity-0 data-[ending-style]:duration-(--duration-exit) data-[starting-style]:scale-97 data-[starting-style]:opacity-0 dark:inset-ring dark:inset-ring-border",
              className,
            )}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
