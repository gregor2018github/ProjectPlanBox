import { useHealth } from "../core/api/coreQueries";
import { cx } from "../ui/cx";
import { Tooltip } from "../ui/Tooltip";

/** A dot and a word telling whether the local server answers. */
export function ConnectionStatus() {
  const { data, isPending, isError } = useHealth();
  const label = isPending ? "Connecting…" : isError ? "Offline" : "Connected";
  const detail = data ? `PlanBox ${data.version}` : "The local server is not answering.";

  return (
    <Tooltip content={isPending ? label : detail} side="top">
      <span
        role="status"
        tabIndex={0}
        className="inline-flex items-center gap-2 rounded-sm text-sm text-text-muted"
      >
        <span
          aria-hidden
          className={cx(
            "size-2 rounded-full",
            isPending && "bg-text-subtle",
            isError && "bg-danger",
            !isPending && !isError && "bg-success",
          )}
        />
        {label}
      </span>
    </Tooltip>
  );
}
