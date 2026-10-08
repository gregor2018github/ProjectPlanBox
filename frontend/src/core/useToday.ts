import { useEffect, useState } from "react";

import { useMeta } from "./api/coreQueries";
import { todayIn, type IsoDate } from "./time";

/**
 * Today's date in the server's timezone; updates itself after midnight.
 * Returns null until the server's metadata has loaded.
 */
export function useToday(): IsoDate | null {
  const { data: meta } = useMeta();
  const timeZone = meta?.timezone;
  const [today, setToday] = useState<IsoDate | null>(() =>
    timeZone === undefined ? null : todayIn(timeZone),
  );

  useEffect(() => {
    if (timeZone === undefined) return;
    const update = () => {
      setToday(todayIn(timeZone));
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [timeZone]);

  return today;
}
