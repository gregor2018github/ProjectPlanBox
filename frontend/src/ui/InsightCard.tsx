import type { ReactNode } from "react";

import { cx } from "./cx";

/** Props for {@link InsightCard}. */
export interface InsightCardProps {
  title: string;
  /** One muted line saying what is counted. */
  subtitle?: string | undefined;
  /** Spans both columns of the Insights grid on wide screens. */
  wide?: boolean;
  children: ReactNode;
}

/** A titled card holding one chart, list or table on the Insights page. */
export function InsightCard({ title, subtitle, wide = false, children }: InsightCardProps) {
  return (
    <section
      aria-label={title}
      className={cx(
        "flex min-w-0 flex-col gap-3 rounded-lg bg-surface p-4",
        wide && "lg:col-span-2",
      )}
    >
      <header>
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle !== undefined && <p className="text-sm text-text-muted">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}
