import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

import { Kbd } from "./Kbd";

/** Props for {@link Tooltip}. */
export interface TooltipProps {
  /** The tooltip text. Never the only way to learn what a control does. */
  content: ReactNode;
  /** Key spec shown after the text, e.g. "[". */
  shortcut?: string | undefined;
  side?: "top" | "bottom" | "left" | "right";
  /** The trigger; must accept props and a ref (a button, typically). */
  children: ReactElement;
}

/** A small label shown on hover and keyboard focus. */
export function Tooltip({ content, shortcut, side = "bottom", children }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-50">
          <BaseTooltip.Popup className="flex items-center gap-2 rounded-md bg-surface-raised px-2 py-1 text-xs text-text shadow-md transition-[opacity,transform] duration-(--duration-fast) ease-out data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 dark:inset-ring dark:inset-ring-border">
            {content}
            {shortcut !== undefined && <Kbd keys={shortcut} />}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
