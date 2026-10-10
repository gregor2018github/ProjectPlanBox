import { useEffect, useState } from "react";

import { zonedParts, type IsoDate } from "../../core/time";

/** The current local date and minute in `timeZone`; updates every minute. */
export function useNow(timeZone: string): { date: IsoDate; minutes: number } {
  const [now, setNow] = useState(() => zonedParts(new Date().toISOString(), timeZone));
  useEffect(() => {
    const update = () => {
      setNow(zonedParts(new Date().toISOString(), timeZone));
    };
    update();
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [timeZone]);
  return now;
}
