import { Link } from "@tanstack/react-router";

import { formatCount } from "../../../core/insights/format";
import { cx } from "../../../ui/cx";
import { todoPaths } from "../paths";
import type { TodoStats } from "../types";

/** Props for {@link ListBucketsTable}. */
export interface ListBucketsTableProps {
  lists: TodoStats["lists"];
}

const NUMBER_CELL = "w-px px-2 py-1.5 text-right whitespace-nowrap tabular-nums";

/** Every list (and the Inbox) as a bucket of work: open, overdue and done. */
export function ListBucketsTable({ lists }: ListBucketsTableProps) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted">
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              List
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
              Open
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
              Overdue
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
              Done, 30 days
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
              Done in total
            </th>
          </tr>
        </thead>
        <tbody>
          {lists.map((list) => (
            <tr key={list.id ?? "inbox"} className="border-t border-border">
              <th scope="row" className="max-w-0 px-2 py-1.5 text-left font-normal">
                <Link
                  to={list.id === null ? todoPaths.inbox : todoPaths.list(list.id)}
                  className="block truncate hover:underline"
                >
                  {list.name}
                  {list.area_name !== null && (
                    <span className="text-text-muted"> · {list.area_name}</span>
                  )}
                </Link>
              </th>
              <td className={NUMBER_CELL}>{formatCount(list.open)}</td>
              <td className={cx(NUMBER_CELL, list.overdue > 0 && "text-danger")}>
                {formatCount(list.overdue)}
              </td>
              <td className={NUMBER_CELL}>{formatCount(list.completed_30)}</td>
              <td className={NUMBER_CELL}>{formatCount(list.completed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
