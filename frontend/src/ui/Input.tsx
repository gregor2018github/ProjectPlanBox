import type { ComponentPropsWithRef } from "react";

import { cx } from "./cx";

/** Props for {@link Input}; `className` is for layout only. */
export interface InputProps extends ComponentPropsWithRef<"input"> {
  /** "plain" has no border (inline editing inside rows and headers). */
  variant?: "boxed" | "plain";
}

/** A single-line text field. */
export function Input({ variant = "boxed", className, type = "text", ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cx(
        "h-8 w-full min-w-0 bg-transparent text-base text-text outline-none placeholder:text-text-subtle coarse:h-11",
        variant === "boxed" &&
          "rounded-md border border-border-strong bg-surface px-2 focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
