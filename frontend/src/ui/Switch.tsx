import { Switch as BaseSwitch } from "@base-ui/react/switch";

/** Props for {@link Switch}. */
export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label next to the switch (also its accessible name). */
  label: string;
}

/** An on/off toggle with a visible label, e.g. "All day". */
export function Switch({ checked, onCheckedChange, label }: SwitchProps) {
  return (
    <label className="inline-flex cursor-default items-center gap-2 text-base text-text select-none coarse:min-h-11">
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={(next) => {
          onCheckedChange(next);
        }}
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-border-strong p-0.5 transition-colors duration-(--duration-fast) ease-out outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[checked]:bg-accent"
      >
        <BaseSwitch.Thumb className="size-4 rounded-full bg-surface shadow-sm transition-transform duration-(--duration-fast) ease-out data-[checked]:translate-x-4" />
      </BaseSwitch.Root>
      {label}
    </label>
  );
}
