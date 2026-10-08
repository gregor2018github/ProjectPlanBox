import type { ReactNode } from "react";

/** Props for {@link PageHeader}. */
export interface PageHeaderProps {
  title: string;
  /** Muted line under the title, e.g. today's date. */
  subtitle?: string | undefined;
  /** Buttons on the right (e.g. a ⋯ menu). */
  actions?: ReactNode;
}

/** The title block of a todos view. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4 px-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle !== undefined && <p className="text-sm text-text-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
