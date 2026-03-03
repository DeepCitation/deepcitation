import { useEffect, useRef, useState } from "react";
import {
  BLINK_ENTER_STEP_MS,
  BLINK_ENTER_TOTAL_MS,
  BLINK_EXIT_TOTAL_MS,
  BLINK_ROW_ENTER_STEP_MS,
  BLINK_ROW_ENTER_TOTAL_MS,
  BLINK_ROW_EXIT_TOTAL_MS,
  BLINK_ROW_FAST_ENTER_STEP_MS,
  BLINK_ROW_FAST_ENTER_TOTAL_MS,
  BLINK_ROW_FAST_EXIT_TOTAL_MS,
} from "../constants.js";
import type { BlinkMotionStage } from "../motion/blinkAnimation.js";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion.js";

type BlinkMotionProfile = "container" | "row";
type BlinkMotionSpeed = "slow" | "fast";
type BlinkMotionTimingOverride = {
  enterStepMs: number;
  enterTotalMs: number;
  exitMs: number;
};

function resolveProfile(profile: BlinkMotionProfile, speed: BlinkMotionSpeed) {
  if (profile === "row") {
    if (speed === "fast") {
      return {
        enterStepMs: BLINK_ROW_FAST_ENTER_STEP_MS,
        enterTotalMs: BLINK_ROW_FAST_ENTER_TOTAL_MS,
        exitMs: BLINK_ROW_FAST_EXIT_TOTAL_MS,
      };
    }
    return {
      enterStepMs: BLINK_ROW_ENTER_STEP_MS,
      enterTotalMs: BLINK_ROW_ENTER_TOTAL_MS,
      exitMs: BLINK_ROW_EXIT_TOTAL_MS,
    };
  }
  return {
    enterStepMs: BLINK_ENTER_STEP_MS,
    enterTotalMs: BLINK_ENTER_TOTAL_MS,
    exitMs: BLINK_EXIT_TOTAL_MS,
  };
}

/**
 * Shared Blink stage machine:
 * - Enter: enter-a (instant) -> enter-b (frame 1 settle) -> steady (frame 2 settle)
 * - Exit:  exit (single settle frame) -> unmount
 */
export function useBlinkMotionStage(
  active: boolean,
  profile: BlinkMotionProfile = "container",
  speed: BlinkMotionSpeed = "slow",
  timingOverride?: BlinkMotionTimingOverride,
): { mounted: boolean; stage: BlinkMotionStage; prefersReducedMotion: boolean } {
  const prefersReducedMotion = usePrefersReducedMotion();
  const timing = timingOverride ?? resolveProfile(profile, speed);
  const [mounted, setMounted] = useState(active);
  const [stage, setStage] = useState<BlinkMotionStage>(active ? "steady" : "idle");

  const mountedRef = useRef(mounted);
  const rafRef = useRef<number>(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  useEffect(() => {
    const clearScheduled = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      if (settleTimerRef.current !== null) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (exitTimerRef.current !== null) {
        clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };

    clearScheduled();

    if (prefersReducedMotion) {
      setMounted(active);
      setStage(active ? "steady" : "idle");
      return clearScheduled;
    }

    if (active) {
      if (!mountedRef.current) {
        setMounted(true);
      }
      setStage("enter-a");
      rafRef.current = requestAnimationFrame(() => {
        setStage("enter-b");
        // Phase 2 should start only after phase 1 completes.
        const settleDelayMs = Math.max(16, Math.min(timing.enterStepMs, timing.enterTotalMs));
        settleTimerRef.current = setTimeout(() => {
          setStage("steady");
          settleTimerRef.current = null;
        }, settleDelayMs);
      });
      return clearScheduled;
    }

    if (!mountedRef.current) {
      setStage("idle");
      return clearScheduled;
    }

    setStage("exit");
    exitTimerRef.current = setTimeout(() => {
      setMounted(false);
      setStage("idle");
      exitTimerRef.current = null;
    }, timing.exitMs);

    return clearScheduled;
  }, [active, profile, speed, prefersReducedMotion, timing.enterStepMs, timing.enterTotalMs, timing.exitMs]);

  return { mounted, stage, prefersReducedMotion };
}
