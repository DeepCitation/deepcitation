/**
 * Shared animation lifecycle hook.
 *
 * Replaces manual setTimeout + state patterns used in several components
 * for enter/exit animations. Handles the full lifecycle: idle -> enter -> idle
 * (on activate) and idle -> exit -> idle (on deactivate).
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useState } from "react";

export type AnimationPhase = "idle" | "enter" | "exit";

export interface UseAnimationStateOptions {
  /** Duration of the enter animation in ms */
  enterMs?: number;
  /** Duration of the exit animation in ms */
  exitMs?: number;
}

export interface UseAnimationStateResult {
  /** Whether the element should be mounted in the DOM (true during enter and exit phases) */
  isMounted: boolean;
  /** Current animation phase */
  phase: AnimationPhase;
  /** Whether an animation is actively playing */
  isAnimating: boolean;
}

/**
 * Manages enter/exit animation lifecycle.
 *
 * When `isActive` transitions true, sets phase to "enter" for `enterMs`,
 * then returns to "idle" (still mounted). When `isActive` transitions false,
 * sets phase to "exit" for `exitMs`, then unmounts.
 *
 * This avoids the common pattern of manual setTimeout + state cleanup.
 *
 * @example
 * ```tsx
 * const { isMounted, phase } = useAnimationState(isOpen, { enterMs: 150, exitMs: 120 });
 * if (!isMounted) return null;
 * return <div className={phase === "enter" ? "animate-in" : phase === "exit" ? "animate-out" : ""}>...</div>;
 * ```
 */
export function useAnimationState(
  isActive: boolean,
  { enterMs = 150, exitMs = 150 }: UseAnimationStateOptions = {},
): UseAnimationStateResult {
  const [phase, setPhase] = useState<AnimationPhase>("idle");
  const [isMounted, setIsMounted] = useState(isActive);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (isActive) {
      setIsMounted(true);
      setPhase("enter");
      timeoutRef.current = setTimeout(() => {
        setPhase("idle");
        timeoutRef.current = null;
      }, enterMs);
    } else if (isMounted) {
      setPhase("exit");
      timeoutRef.current = setTimeout(() => {
        setPhase("idle");
        setIsMounted(false);
        timeoutRef.current = null;
      }, exitMs);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isActive, enterMs, exitMs]); // eslint-disable-line react-hooks/exhaustive-deps -- isMounted is tracked internally

  return {
    isMounted,
    phase,
    isAnimating: phase !== "idle",
  };
}
