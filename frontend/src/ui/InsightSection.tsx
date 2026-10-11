import type { ReactNode } from "react";

/** Props for {@link InsightSection}. */
export interface InsightSectionProps {
  /** Anchor for the page's jump links, e.g. "insights-todos". */
  id: string;
  title: string;
  subtitle?: string | undefined;
  /** A row of stat tiles above the cards. */
  tiles?: ReactNode;
  /** The cards; they flow into two columns on wide screens. */
  children?: ReactNode;
}

/** One block of the Insights page: a heading, headline tiles, then cards. */
export function InsightSection({ id, title, subtitle, tiles, children }: InsightSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-6 flex-col gap-4">
      <header>
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {subtitle !== undefined && <p className="text-sm text-text-muted">{subtitle}</p>}
      </header>
      {tiles !== undefined && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{tiles}</div>
      )}
      {children !== undefined && <div className="grid gap-4 lg:grid-cols-2">{children}</div>}
    </section>
  );
}
