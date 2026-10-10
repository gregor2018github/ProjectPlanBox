import { motion, type MotionProps } from "motion/react";
import { useEffect, useState } from "react";

import { durations, easings, splashTimeline as t } from "../ui/motion";

/** sessionStorage key: the splash plays once per tab, not on every reload. */
export const SPLASH_SEEN_KEY = "planbox.splashSeen";

/**
 * Share of the tick's length taken by its short first leg
 * (|(12,22)→(17.5,27.5)| ÷ total), where the pen pauses at the corner.
 */
const TICK_CORNER = 0.24;
const TICK_PATH = "M12 22 L17.5 27.5 L33 8";
/** The long leg starts briskly from the pause and glides out, like a flick of the pen. */
const PEN_FLICK: [number, number, number, number] = [0.4, 0, 0.2, 1];

type Phase = "showing" | "leaving" | "done";

/** Read directly (not via Motion's cached hook) so it is right on first render. */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SPLASH_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
  } catch {
    // Without storage the splash simply plays again on reload.
  }
}

/**
 * The startup logo: a box, the "PlanBox" wordmark and a tick drawn into the
 * box like a pen stroke, then a soft fade revealing the app. The app mounts
 * underneath straight away, any click or key skips the splash, and it is not
 * shown at all with reduced motion or a second time in the same tab.
 */
export function StartupSplash() {
  const [phase, setPhase] = useState<Phase>(() =>
    prefersReducedMotion() || alreadySeen() ? "done" : "showing",
  );
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (phase !== "showing") return;
    markSeen();
    const timer = window.setTimeout(
      () => {
        setPhase("leaving");
      },
      (t.tickDelay + t.tickDuration + t.hold) * 1000,
    );
    const skip = () => {
      setSkipped(true);
      setPhase("leaving");
    };
    window.addEventListener("keydown", skip, { capture: true });
    window.addEventListener("pointerdown", skip, { capture: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", skip, { capture: true });
      window.removeEventListener("pointerdown", skip, { capture: true });
    };
  }, [phase]);

  if (phase === "done") return null;
  const leaving = phase === "leaving";

  return (
    <motion.div
      aria-hidden="true"
      data-testid="startup-splash"
      className={`bg-bg fixed inset-0 z-50 flex items-center justify-center ${leaving ? "pointer-events-none" : ""}`}
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: skipped ? durations.slow : t.fadeOut, ease: easings.inOut }}
      onAnimationComplete={() => {
        if (leaving) setPhase("done");
      }}
    >
      <motion.div
        className="flex flex-col items-center gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: t.logoDelay, duration: t.logoDuration, ease: easings.out }}
      >
        <svg
          viewBox="0 0 40 40"
          className="size-20"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect
            x="5"
            y="9"
            width="26"
            height="26"
            rx="6"
            className="stroke-text"
            strokeWidth="2.5"
          />
          {/* A background-coloured halo under the tick cuts it cleanly across the box edge. */}
          <motion.path d={TICK_PATH} className="stroke-bg" strokeWidth="7.5" {...tickMotion} />
          <motion.path d={TICK_PATH} className="stroke-accent" strokeWidth="3.5" {...tickMotion} />
        </svg>
        <span className="font-display text-display text-text font-semibold tracking-tight">
          Plan<span className="text-accent">Box</span>
        </span>
      </motion.div>
    </motion.div>
  );
}

/** The pen stroke: short leg, a brief pause at the corner, then the long flick. */
const tickMotion: MotionProps = {
  initial: { pathLength: 0, opacity: 0 },
  animate: { pathLength: [0, TICK_CORNER, TICK_CORNER, 1], opacity: 1 },
  transition: {
    delay: t.tickDelay,
    pathLength: {
      delay: t.tickDelay,
      duration: t.tickDuration,
      times: [0, 0.3, 0.4, 1],
      ease: [[...easings.inOut], "linear", PEN_FLICK],
    },
    opacity: { delay: t.tickDelay, duration: 0.01 },
  },
};
