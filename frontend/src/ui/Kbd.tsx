import { formatKeys } from "../core/shortcuts/keys";
import { cx } from "./cx";

/** Props for {@link Kbd}. */
export interface KbdProps {
  /** Key spec such as "Ctrl+K" or "G I". */
  keys: string;
  className?: string;
}

/** Shows a shortcut as key caps; sequences are joined with "then". */
export function Kbd({ keys, className }: KbdProps) {
  const chords = formatKeys(keys);
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs text-text-muted", className)}>
      {chords.map((caps, i) => (
        <span key={i} className="inline-flex items-center gap-0.5">
          {i > 0 && <span className="px-0.5">then</span>}
          {caps.map((cap) => (
            <kbd
              key={cap}
              className="min-w-5 rounded-sm border border-border bg-surface px-1 text-center font-sans text-xs text-text-muted"
            >
              {cap}
            </kbd>
          ))}
        </span>
      ))}
    </span>
  );
}
