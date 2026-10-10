import {
  Calendar1,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";

import { Button } from "../../../ui/Button";
import { IconButton } from "../../../ui/IconButton";
import { SegmentedControl, type SegmentOption } from "../../../ui/SegmentedControl";
import type { CalendarView } from "../types";

/** Props for {@link CalendarToolbar}. */
export interface CalendarToolbarProps {
  title: string;
  view: CalendarView;
  showToday: boolean;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onView: (view: CalendarView) => void;
  onNew: () => void;
}

const VIEWS: readonly SegmentOption<CalendarView>[] = [
  { value: "month", label: "Month (M)", icon: CalendarDays },
  { value: "week", label: "Week (W)", icon: CalendarRange },
  { value: "day", label: "Day (D)", icon: Calendar1 },
];

/** The calendar page's header: the period, navigation, the view switch and "New event". */
export function CalendarToolbar({
  title,
  view,
  showToday,
  onToday,
  onPrevious,
  onNext,
  onView,
  onNew,
}: CalendarToolbarProps) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 md:px-6">
      <h1 className="mr-auto min-w-0 truncate text-xl font-semibold" aria-live="polite">
        {title}
      </h1>
      <div className="flex items-center gap-1">
        {showToday && (
          <Button variant="secondary" onClick={onToday}>
            Today
          </Button>
        )}
        <IconButton label="Previous" icon={ChevronLeft} shortcut="K" onClick={onPrevious} />
        <IconButton label="Next" icon={ChevronRight} shortcut="J" onClick={onNext} />
      </div>
      <SegmentedControl label="View" value={view} onChange={onView} options={VIEWS} />
      <Button variant="primary" onClick={onNew}>
        <Plus size={16} strokeWidth={1.75} aria-hidden />
        New event
      </Button>
    </div>
  );
}
