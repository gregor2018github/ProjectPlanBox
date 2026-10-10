import type { ComponentPropsWithRef } from "react";

import { cx } from "./cx";

/** Props for {@link Select}; `className` is for layout only. */
export type SelectProps = ComponentPropsWithRef<"select">;

/**
 * A native single-choice dropdown, styled like {@link Input}. Native keeps
 * keyboard, screen-reader and touch behaviour (the OS picker on phones).
 */
export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cx(
        "h-8 min-w-0 rounded-md border border-border-strong bg-surface px-2 text-base text-text outline-none focus:border-accent coarse:h-11",
        className,
      )}
      {...props}
    />
  );
}
