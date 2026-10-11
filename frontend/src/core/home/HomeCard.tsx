import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "../../ui/cx";

/** Props for {@link HomeCard}. */
export interface HomeCardProps {
  title: string;
  /** One muted line with the headline numbers, e.g. "3 overdue · 5 due today". */
  summary?: string | undefined;
  /** The full view behind the card; the title links there. */
  to?: string | undefined;
  /** Spans both columns of the Home grid on wide screens. */
  wide?: boolean;
  /** Left out while the module's data is loading. */
  children?: ReactNode;
}

/** One module's block on Home: a title that leads to the full view, a summary, then content. */
export function HomeCard({ title, summary, to, wide = false, children }: HomeCardProps) {
  const id = `home-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className={cx(
        "flex min-w-0 flex-col gap-2 rounded-lg bg-surface p-3 md:p-4",
        wide && "lg:col-span-2",
      )}
    >
      <header className="flex min-w-0 flex-wrap items-baseline gap-x-3 px-1">
        <h2 id={id} className="text-base font-semibold">
          {to === undefined ? (
            title
          ) : (
            <Link
              to={to}
              className="-mx-1 inline-flex items-center gap-0.5 rounded-md px-1 transition-colors duration-(--duration-fast) ease-out hover:bg-hover coarse:min-h-11"
            >
              {title}
              <ChevronRight size={16} strokeWidth={1.75} aria-hidden className="text-text-muted" />
            </Link>
          )}
        </h2>
        {summary !== undefined && <p className="text-sm text-text-muted">{summary}</p>}
      </header>
      {children}
    </section>
  );
}
