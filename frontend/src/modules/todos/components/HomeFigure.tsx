import { Link } from "@tanstack/react-router";

import { cx } from "../../../ui/cx";

/** Props for {@link HomeFigure}. */
export interface HomeFigureProps {
  label: string;
  value: number;
  to: string;
  danger?: boolean;
}

/** One number on the Home todos card that leads to its view. */
export function HomeFigure({ label, value, to, danger = false }: HomeFigureProps) {
  return (
    <Link
      to={to}
      className="flex min-w-0 flex-col rounded-md px-2 py-1.5 transition-colors duration-(--duration-fast) ease-out hover:bg-hover coarse:min-h-11"
    >
      <span
        className={cx(
          "text-lg font-semibold tabular-nums",
          danger && value > 0 ? "text-danger" : value === 0 && "text-text-muted",
        )}
      >
        {value}
      </span>
      <span className="truncate text-sm text-text-muted">{label}</span>
    </Link>
  );
}
