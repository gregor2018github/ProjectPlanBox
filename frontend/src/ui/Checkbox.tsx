import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

import { cx } from "./cx";

/** Props for {@link Checkbox}. */
export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Complete “Pay rent”". */
  label: string;
  /** Tints the ring for high/medium priority. */
  tone?: "default" | "danger" | "warning";
  size?: "md" | "sm";
}

const tones = {
  default: "border-border-strong",
  danger: "border-danger",
  warning: "border-warning",
} as const;

/** The round todo checkbox: a quick tick, accent fill when done. */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  tone = "default",
  size = "md",
}: CheckboxProps) {
  return (
    <BaseCheckbox.Root
      checked={checked}
      onCheckedChange={(next) => {
        onCheckedChange(next);
      }}
      aria-label={label}
      className={cx(
        "relative flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-(--duration-fast) ease-out outline-none before:absolute before:-inset-2 before:content-[''] hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[checked]:border-accent data-[checked]:bg-accent coarse:before:-inset-3",
        size === "md" ? "size-4.5" : "size-4",
        tones[tone],
      )}
    >
      <BaseCheckbox.Indicator className="flex text-on-accent transition-transform duration-(--duration-fast) ease-out data-[starting-style]:scale-50 data-[unchecked]:hidden">
        <Check size={size === "md" ? 12 : 10} strokeWidth={3} aria-hidden />
      </BaseCheckbox.Indicator>
    </BaseCheckbox.Root>
  );
}
