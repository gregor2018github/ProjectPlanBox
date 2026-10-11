import { HomeCard } from "../../../core/home/HomeCard";
import { HABITS_PATH } from "../paths";
import { useHabitData } from "../queries";
import { useHabitActions } from "../useHabitActions";
import { TodayHabitRow } from "./TodayHabitRow";

/** The habits card on Home: today's scheduled habits to tick off, with streaks. */
export function HabitHome() {
  const { habits, today, loading } = useHabitData();
  const actions = useHabitActions();
  if (today === null || loading) return <HomeCard title="Habits" to={HABITS_PATH} />;

  const due = habits.filter((h) => h.scheduled.includes(today));
  const done = due.filter((h) => h.checkins.includes(today)).length;
  const summary =
    due.length === 0
      ? undefined
      : done === due.length
        ? "All done today"
        : `${String(done)} of ${String(due.length)} done today`;

  return (
    <HomeCard title="Habits" summary={summary} to={HABITS_PATH}>
      {due.length > 0 ? (
        <ul aria-label="Today's habits" className="flex flex-col">
          {due.map((h) => (
            <TodayHabitRow key={h.id} habit={h} today={today} actions={actions} />
          ))}
        </ul>
      ) : (
        <p className="px-2 py-1 text-sm text-text-muted">
          {habits.length === 0 ? "No habits yet." : "Nothing scheduled today."}
        </p>
      )}
    </HomeCard>
  );
}
