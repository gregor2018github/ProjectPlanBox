import type { ComponentPropsWithRef } from "react";

import { cx } from "./cx";

/** Visual weight: at most one primary per view. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** Height step. */
export type ButtonSize = "sm" | "md";

const variants = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "bg-surface text-text border border-border-strong hover:bg-hover",
  ghost: "text-text hover:bg-hover",
  danger: "bg-danger text-on-accent hover:opacity-90",
} satisfies Record<ButtonVariant, string>;

const sizes = {
  sm: "h-7 px-2 text-sm coarse:h-11",
  md: "h-8 px-3 text-base coarse:h-11",
} satisfies Record<ButtonSize, string>;

/** Props for {@link Button}. `className` is for layout (margin, width) only. */
export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** The standard button. Defaults to `type="button"` and the ghost variant. */
export function Button({
  variant = "ghost",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-out select-none disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
