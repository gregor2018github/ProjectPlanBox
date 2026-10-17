import { CheckCheck, History } from "lucide-react";

import { PageHeader } from "../../../ui/PageHeader";
import { SegmentedControl, type SegmentOption } from "../../../ui/SegmentedControl";
import { ViewLayout } from "../../../ui/ViewLayout";
import { ActivityLog } from "../components/ActivityLog";
import { CompletedLog } from "../components/CompletedLog";
import { useLogbookMode, type LogbookMode } from "../viewModes";

const MODES: readonly SegmentOption<LogbookMode>[] = [
  { value: "completed", label: "Completed", icon: CheckCheck },
  { value: "activity", label: "Activity", icon: History },
];

/**
 * The Logbook: what was completed, by the day it was done, or the activity
 * feed of what was added or changed. The switch is remembered per browser.
 */
export function LogbookPage() {
  const [mode, setMode] = useLogbookMode();
  return (
    <ViewLayout>
      <PageHeader
        title="Logbook"
        subtitle={
          mode === "completed"
            ? "Everything you have completed."
            : "When todos were added or changed."
        }
        actions={
          <SegmentedControl
            label="Logbook view"
            value={mode}
            onChange={setMode}
            options={MODES}
            showLabels
          />
        }
      />
      {mode === "completed" ? <CompletedLog /> : <ActivityLog />}
    </ViewLayout>
  );
}
