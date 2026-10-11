import { useMeta } from "../core/api/coreQueries";
import { formatDayLong, todayIn } from "../core/time";
import { Kbd } from "../ui/Kbd";
import { greeting, homeSections, hourIn } from "./home";
import { useModules } from "./modulesContext";
import { WeekCard } from "./WeekCard";

/**
 * The overview: what is due, what is planned, which habits are left and
 * what changed lately, one card per module, then the last seven days.
 */
export function HomePage() {
  const { data: meta } = useMeta();
  const sections = homeSections(useModules());

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-24 md:px-6 md:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 px-1">
        <div>
          <p className="text-sm text-text-muted">{meta ? greeting(hourIn(meta.timezone)) : " "}</p>
          <h1 className="text-xl font-semibold tracking-tight">
            {meta ? formatDayLong(todayIn(meta.timezone)) : " "}
          </h1>
        </div>
        <p className="hidden flex-wrap items-center gap-1.5 text-sm text-text-muted md:flex">
          <Kbd keys="Ctrl+K" /> commands · <Kbd keys="?" /> shortcuts
        </p>
      </header>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {sections.map((module) => module.HomeSection && <module.HomeSection key={module.id} />)}
        <WeekCard />
      </div>
    </div>
  );
}
