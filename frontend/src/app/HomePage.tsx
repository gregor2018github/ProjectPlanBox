import { useMeta } from "../core/api/coreQueries";
import { formatDayLong, todayIn } from "../core/time";
import { Kbd } from "../ui/Kbd";

/** The neutral start page: today's date and how to get going. */
export function HomePage() {
  const { data: meta } = useMeta();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4 pt-10 md:px-6 md:pt-16">
      <h1 className="text-xl font-semibold tracking-tight">
        {meta ? formatDayLong(todayIn(meta.timezone)) : " "}
      </h1>
      <p className="flex flex-wrap items-center gap-1.5 text-base text-text-muted">
        Press <Kbd keys="Ctrl+K" /> for commands, <Kbd keys="?" /> for shortcuts.
      </p>
    </div>
  );
}
