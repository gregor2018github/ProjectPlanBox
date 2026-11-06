import { formatDayLong } from "../../../core/time";
import { PageHeader } from "../../../ui/PageHeader";
import { ViewLayout } from "../../../ui/ViewLayout";
import { DayPlanView } from "../components/DayPlanView";
import { useTodoActions } from "../useTodoActions";
import { useTodoData } from "../useTodoData";

/**
 * Day plan (owner request, 2026-11-01): what to do today, picked fresh each
 * day and sorted by hand, with proposals from all open todos below. It is empty
 * again after midnight.
 */
export function DayPlanPage() {
  const data = useTodoData();
  const actions = useTodoActions();
  return (
    <ViewLayout>
      <PageHeader
        title="Day Plan"
        subtitle={data.today === null ? undefined : formatDayLong(data.today)}
      />
      <DayPlanView data={data} actions={actions} />
    </ViewLayout>
  );
}
