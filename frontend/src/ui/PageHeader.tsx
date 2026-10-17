import type { ReactNode } from "react";

import { cx } from "./cx";

/** Props for {@link PageHeader}. */
export interface PageHeaderProps {
  title: string;
  /** Muted line under the title, e.g. today's date. */
  subtitle?: string | undefined;
  /** Buttons on the right (e.g. a ⋯ menu). */
  actions?: ReactNode;
  /** A small mark before the title (e.g. an area's colour dot). */
  leading?: ReactNode;
  /**
   * Fills the header with the wash of the surrounding tint (an area's
   * colour); only inside a tinted view (`ViewLayout tint`).
   */
  wash?: boolean;
}

/** The title block of a view. */
export function PageHeader({ title, subtitle, actions, leading, wash = false }: PageHeaderProps) {
  return (
    <header
      {...(wash && { "data-wash": "" })}
      className={cx(
        "mb-4 flex items-start justify-between gap-4 px-3",
        wash && "rounded-lg bg-wash py-3 transition-colors duration-(--duration-base) ease-out",
      )}
    >
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {leading}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle !== undefined && <p className="text-sm text-text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
