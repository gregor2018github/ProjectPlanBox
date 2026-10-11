import type { ReactNode } from "react";

import { tintProps } from "./tint";

/** Props for {@link ViewLayout}. */
export interface ViewLayoutProps {
  children: ReactNode;
  /** Re-tints the accent inside the view with this hue (an area's colour). */
  tint?: number | undefined;
}

/** The centred, readable column every list-style view uses. */
export function ViewLayout({ children, tint }: ViewLayoutProps) {
  return (
    <div
      {...(tint !== undefined && tintProps(tint))}
      className="mx-auto w-full max-w-3xl px-1 pt-6 pb-24 md:px-6 md:pt-10"
    >
      {children}
    </div>
  );
}
