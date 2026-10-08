import type { ComponentPropsWithRef } from "react";

import { cx } from "./cx";

/** Props for {@link TextArea}; `className` is for layout only. */
export type TextAreaProps = ComponentPropsWithRef<"textarea">;

/** A multi-line field that grows with its content. */
export function TextArea({ className, ...props }: TextAreaProps) {
  return (
    <textarea
      className={cx(
        "field-sizing-content min-h-20 w-full resize-none rounded-md bg-transparent px-0 py-1 text-base text-text outline-none placeholder:text-text-subtle",
        className,
      )}
      {...props}
    />
  );
}
