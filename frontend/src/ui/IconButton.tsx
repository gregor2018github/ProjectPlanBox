import type { LucideIcon } from "lucide-react";
import type { ComponentPropsWithRef } from "react";

import { cx } from "./cx";
import { Tooltip } from "./Tooltip";

/** Props for {@link IconButton}. */
export interface IconButtonProps extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** Accessible name and tooltip text; required because there is no visible label. */
  label: string;
  icon: LucideIcon;
  /** Key spec shown in the tooltip. */
  shortcut?: string | undefined;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  /** Makes it a toggle button (aria-pressed) and highlights it while on. */
  pressed?: boolean;
}

/** An icon-only ghost button with an accessible name and a tooltip. */
export function IconButton({
  label,
  icon: Icon,
  shortcut,
  tooltipSide,
  pressed,
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip content={label} shortcut={shortcut} {...(tooltipSide && { side: tooltipSide })}>
      <button
        type={type}
        aria-label={label}
        {...(pressed !== undefined && { "aria-pressed": pressed })}
        className={cx(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors duration-(--duration-fast) ease-out hover:bg-hover hover:text-text coarse:size-11",
          pressed === true && "bg-selected text-text",
          className,
        )}
        {...props}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </Tooltip>
  );
}
