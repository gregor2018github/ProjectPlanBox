import type { LucideIcon } from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { useRef, useState, type ReactNode, type TouchEvent } from "react";

import { cx } from "./cx";
import { isDragMoving } from "./dnd";
import { springs } from "./motion";
import {
  releasedSwipe,
  SWIPE,
  swipeIntent,
  swipeOffset,
  type SwipeDirection,
  type SwipeIntent,
} from "./swipe";

/** What a swipe in one direction does. */
export interface SwipeAction {
  label: string;
  icon: LucideIcon;
  /** The panel's colour once the swipe has gone far enough to act. */
  tone: "accent" | "danger";
  onSwipe: () => void;
}

/** Props for {@link SwipeRow}. */
export interface SwipeRowProps {
  /** Done when the finger swipes the row to the right (null: none). */
  swipeRight?: SwipeAction | null | undefined;
  /** Done when the finger swipes the row to the left (null: none). */
  swipeLeft?: SwipeAction | null | undefined;
  children: ReactNode;
}

interface Gesture {
  x: number;
  y: number;
  time: number;
  width: number;
  intent: SwipeIntent;
}

const ARMED_TONE = {
  accent: "bg-accent text-on-accent",
  danger: "bg-danger text-on-danger",
} as const;

/**
 * A row that can be swiped sideways on touch, as in Microsoft To Do: it
 * follows the finger over a panel naming the action, which takes its
 * colour once the swipe has gone far enough; letting go there acts, and the
 * row springs back either way. A mouse never swipes, and a hold still
 * starts a drag (see `swipe.ts`). Every swipe action must also be in the
 * row's menu.
 */
export function SwipeRow({ swipeRight = null, swipeLeft = null, children }: SwipeRowProps) {
  const x = useMotionValue(0);
  const rightWidth = useTransform(x, (v) => Math.max(0, v));
  const leftWidth = useTransform(x, (v) => Math.max(0, -v));
  const reduceMotion = useReducedMotion() === true;
  const gesture = useRef<Gesture | null>(null);
  const settle = useRef<AnimationPlaybackControls | null>(null);
  const swallowClick = useRef(false);
  const [armed, setArmed] = useState<SwipeDirection | null>(null);
  const [active, setActive] = useState(false);
  const allowed = { right: swipeRight !== null, left: swipeLeft !== null };

  const springBack = () => {
    const done = () => {
      setActive(false);
    };
    settle.current = animate(
      x,
      0,
      reduceMotion ? { duration: 0, onComplete: done } : { ...springs.snappy, onComplete: done },
    );
    setArmed(null);
  };

  const onTouchStart = (event: TouchEvent) => {
    swallowClick.current = false;
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    if (
      touch === undefined ||
      (!allowed.right && !allowed.left) ||
      isDragMoving() ||
      touch.clientX < SWIPE.edge ||
      touch.clientX > window.innerWidth - SWIPE.edge
    ) {
      gesture.current = null;
      return;
    }
    settle.current?.stop();
    gesture.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: event.timeStamp,
      width: event.currentTarget.getBoundingClientRect().width,
      intent: "pending",
    };
  };

  const onTouchMove = (event: TouchEvent) => {
    const g = gesture.current;
    const touch = event.touches[0];
    if (g === null || touch === undefined) return;
    const dx = touch.clientX - g.x;
    if (g.intent === "pending") {
      g.intent = swipeIntent(dx, touch.clientY - g.y, event.timeStamp - g.time);
      if (g.intent === "other") gesture.current = null;
      if (g.intent !== "swipe") return;
      setActive(true);
    }
    // Measured from where the swipe began, so the row does not jump.
    const offset = swipeOffset(dx - Math.sign(dx) * SWIPE.start, allowed, g.width);
    x.set(offset);
    setArmed(releasedSwipe(offset, g.width));
  };

  const onTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.intent !== "swipe") return;
    swallowClick.current = true;
    const direction = releasedSwipe(x.get(), g.width);
    springBack();
    if (direction === "right") swipeRight?.onSwipe();
    if (direction === "left") swipeLeft?.onSwipe();
  };

  const onTouchCancel = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.intent === "swipe") springBack();
  };

  const panels = [
    { direction: "right" as const, action: swipeRight, width: rightWidth, side: "left-0" },
    {
      direction: "left" as const,
      action: swipeLeft,
      width: leftWidth,
      side: "right-0 justify-end",
    },
  ];

  return (
    <div
      className={cx("relative touch-pan-y rounded-md", active && "overflow-hidden")}
      // Capture: the context menu's trigger inside stops touchstart from bubbling.
      onTouchStartCapture={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onClickCapture={(event) => {
        // The tap that ends a swipe must not open the row.
        if (!swallowClick.current) return;
        swallowClick.current = false;
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      {active &&
        panels.map(({ direction, action, width, side }) => {
          if (action === null) return null;
          const Icon = action.icon;
          return (
            <motion.div
              key={direction}
              aria-hidden
              data-swipe-panel={direction}
              data-armed={armed === direction ? "" : undefined}
              style={{ width }}
              className={cx(
                "absolute inset-y-0 flex items-center overflow-hidden text-sm font-medium whitespace-nowrap transition-colors duration-(--duration-fast) ease-out",
                side,
                armed === direction ? ARMED_TONE[action.tone] : "bg-hover text-text-muted",
              )}
            >
              {/* Padding inside, so the panel can shrink to nothing. */}
              <span className="flex shrink-0 items-center gap-2 px-4">
                <Icon size={16} strokeWidth={1.75} className="shrink-0" />
                {action.label}
              </span>
            </motion.div>
          );
        })}
      <motion.div style={{ x }} className="relative">
        {children}
      </motion.div>
    </div>
  );
}
