import type { ReactNode } from "react";

/** Props for {@link ViewLayout}. */
export interface ViewLayoutProps {
  children: ReactNode;
}

/** The centred, readable column every todos view uses. */
export function ViewLayout({ children }: ViewLayoutProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-1 pt-6 pb-24 md:px-6 md:pt-10">{children}</div>
  );
}
