import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { cx } from "./cx";
import { hueAt, hueName, normalizeHue, tintProps } from "./tint";

/** Props for {@link HueWheel}. */
export interface HueWheelProps {
  /** 0–359 OKLCH degrees. */
  value: number;
  onChange: (hue: number) => void;
  /** Accessible name of the slider. */
  label: string;
  /** Quick picks shown under the wheel. */
  presets?: readonly number[];
}

/** Ring centre radius as a share of the wheel's width (176 px wheel, 16 px ring). */
const HANDLE_RADIUS = 80 / 176;

const KEY_STEPS: Record<string, number> = {
  ArrowRight: 5,
  ArrowUp: 5,
  ArrowLeft: -5,
  ArrowDown: -5,
  PageUp: 30,
  PageDown: -30,
};

/**
 * A colour wheel for picking a hue: drag anywhere on it, use the arrow keys
 * (Page Up/Down for bigger steps) or tap a preset. The centre previews the
 * hue as the tinted accent, so it shows what the result looks like in the
 * current theme rather than a raw colour.
 */
export function HueWheel({ value, onChange, label, presets = [] }: HueWheelProps) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const hue = normalizeHue(value);
  const angle = (hue * Math.PI) / 180;

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = wheelRef.current?.getBoundingClientRect();
    if (rect) onChange(hueAt(event.clientX, event.clientY, rect));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEPS[event.key];
    if (event.key === "Home") onChange(0);
    else if (step !== undefined) onChange(normalizeHue(hue + step));
    else return;
    event.preventDefault();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={wheelRef}
        className="relative size-44 cursor-pointer touch-none rounded-full bg-(image:--tint-wheel) select-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pick(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
        }}
      >
        <div
          {...tintProps(hue)}
          className="absolute inset-4 flex items-center justify-center rounded-full bg-surface-raised"
        >
          <span className="size-12 rounded-full bg-accent" aria-hidden />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={hue}
          aria-valuetext={`${hue}°, ${hueName(hue)}`}
          onKeyDown={onKeyDown}
          data-tint=""
          style={{
            ...tintProps(hue).style,
            left: `${50 + 100 * HANDLE_RADIUS * Math.sin(angle)}%`,
            top: `${50 - 100 * HANDLE_RADIUS * Math.cos(angle)}%`,
          }}
          className="absolute size-6 -translate-1/2 rounded-full border-2 border-surface-raised bg-accent shadow-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />
      </div>
      {presets.length > 0 && (
        <div
          className="flex flex-wrap justify-center gap-2"
          role="group"
          aria-label="Suggested colours"
        >
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`${hueName(preset)} (${preset}°)`}
              aria-pressed={preset === hue}
              onClick={() => {
                onChange(preset);
              }}
              {...tintProps(preset)}
              className={cx(
                "relative size-6 rounded-full bg-accent outline-none before:absolute before:-inset-1 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus coarse:size-8 coarse:before:-inset-1.5",
                preset === hue && "ring-2 ring-accent ring-offset-2 ring-offset-surface-raised",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
