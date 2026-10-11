import { ActivitySection } from "../core/insights/ActivitySection";
import { PageHeader } from "../ui/PageHeader";
import { useModules } from "./modulesContext";

/**
 * Statistics across PlanBox: the core's cross-module overview first, then
 * each module's own section in sidebar order, with jump links on top.
 */
export function InsightsPage() {
  const modules = useModules();
  const sections = modules.filter((m) => m.InsightsSection !== undefined);
  const typeLabel = (entityType: string) => {
    const id = entityType.split(".")[0];
    return modules.find((m) => m.id === id)?.label ?? entityType;
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 pt-6 pb-24 md:px-6 md:pt-10">
      <div className="-mx-3 -mb-6">
        <PageHeader title="Insights" subtitle="How you use PlanBox, in numbers." />
      </div>
      <nav aria-label="Insights sections" className="flex flex-wrap gap-2">
        {[{ id: "overview", label: "Overview" }, ...sections].map((section) => (
          <a
            key={section.id}
            href={`#insights-${section.id}`}
            onClick={(event) => {
              // The router owns the URL; just scroll to the section.
              event.preventDefault();
              document.getElementById(`insights-${section.id}`)?.scrollIntoView({
                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
                block: "start",
              });
            }}
            className="flex h-7 items-center rounded-full bg-hover px-3 text-sm text-text transition-colors duration-(--duration-fast) ease-out hover:bg-selected coarse:h-11"
          >
            {section.label}
          </a>
        ))}
      </nav>
      <ActivitySection typeLabel={typeLabel} />
      {sections.map(
        (module) => module.InsightsSection && <module.InsightsSection key={module.id} />,
      )}
    </div>
  );
}
