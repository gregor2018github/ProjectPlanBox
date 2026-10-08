import { Monitor, Moon, Sun } from "lucide-react";

import type { ThemePreference } from "../core/theme/theme";
import { useTheme } from "../core/theme/useTheme";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";

const OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { value: "system", label: "Match system", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** System / light / dark switch. */
export function ThemeSwitch() {
  const { preference, setPreference } = useTheme();
  return (
    <SegmentedControl label="Theme" value={preference} onChange={setPreference} options={OPTIONS} />
  );
}
