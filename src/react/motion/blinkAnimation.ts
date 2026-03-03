import type React from "react";
import {
  BLINK_ENTER_EASING,
  BLINK_ENTER_OPACITY_A,
  BLINK_ENTER_OPACITY_B,
  BLINK_ENTER_SCALE_A,
  BLINK_ENTER_SCALE_B,
  BLINK_ENTER_STEP_MS,
  BLINK_ENTER_TOTAL_MS,
  BLINK_ENTER_Y_A_PX,
  BLINK_ENTER_Y_B_PX,
  BLINK_EXIT_EASING,
  BLINK_EXIT_OPACITY,
  BLINK_EXIT_SCALE,
  BLINK_EXIT_TOTAL_MS,
  BLINK_EXIT_Y_PX,
  BLINK_ROW_ENTER_STEP_MS,
  BLINK_ROW_ENTER_TOTAL_MS,
  BLINK_ROW_EXIT_OPACITY,
  BLINK_ROW_EXIT_TOTAL_MS,
  BLINK_ROW_INSET_A_PX,
  BLINK_ROW_INSET_B_PX,
  BLINK_ROW_OPACITY_A,
  BLINK_ROW_OPACITY_B,
} from "../constants.js";

export type BlinkMotionStage = "idle" | "enter-a" | "enter-b" | "steady" | "exit";

function resolveTransition(stage: BlinkMotionStage, enterStepMs: number, enterTotalMs: number, exitMs: number): string {
  if (stage === "enter-a" || stage === "idle") return "none";
  if (stage === "enter-b")
    return `transform ${enterStepMs}ms ${BLINK_ENTER_EASING}, opacity ${enterStepMs}ms ${BLINK_ENTER_EASING}`;
  if (stage === "steady") {
    const settleMs = Math.max(16, enterTotalMs - enterStepMs);
    return `transform ${settleMs}ms ${BLINK_ENTER_EASING}, opacity ${settleMs}ms ${BLINK_ENTER_EASING}`;
  }
  return `transform ${exitMs}ms ${BLINK_EXIT_EASING}, opacity ${exitMs}ms ${BLINK_EXIT_EASING}`;
}

function resolvePaddingTransition(
  stage: BlinkMotionStage,
  enterStepMs: number,
  enterTotalMs: number,
  exitMs: number,
): string {
  if (stage === "enter-a" || stage === "idle") return "none";
  if (stage === "enter-b") {
    return `padding-top ${enterStepMs}ms ${BLINK_ENTER_EASING}, transform ${enterStepMs}ms ${BLINK_ENTER_EASING}, grid-template-rows ${enterStepMs}ms ${BLINK_ENTER_EASING}, opacity ${enterStepMs}ms ${BLINK_ENTER_EASING}`;
  }
  if (stage === "steady") {
    const settleMs = Math.max(16, enterTotalMs - enterStepMs);
    return `padding-top ${settleMs}ms ${BLINK_ENTER_EASING}, transform ${settleMs}ms ${BLINK_ENTER_EASING}, grid-template-rows ${settleMs}ms ${BLINK_ENTER_EASING}, opacity ${settleMs}ms ${BLINK_ENTER_EASING}`;
  }
  return `padding-top ${exitMs}ms ${BLINK_EXIT_EASING}, transform ${exitMs}ms ${BLINK_EXIT_EASING}, grid-template-rows ${exitMs}ms ${BLINK_EXIT_EASING}, opacity ${exitMs}ms ${BLINK_EXIT_EASING}`;
}

function containerTransform(stage: BlinkMotionStage): string {
  if (stage === "enter-a") return `translate3d(0, ${BLINK_ENTER_Y_A_PX}px, 0) scale(${BLINK_ENTER_SCALE_A})`;
  if (stage === "enter-b") return `translate3d(0, ${BLINK_ENTER_Y_B_PX}px, 0) scale(${BLINK_ENTER_SCALE_B})`;
  if (stage === "exit") return `translate3d(0, ${BLINK_EXIT_Y_PX}px, 0) scale(${BLINK_EXIT_SCALE})`;
  return "translate3d(0, 0, 0) scale(1)";
}

function containerOpacity(stage: BlinkMotionStage): number {
  if (stage === "enter-a") return BLINK_ENTER_OPACITY_A;
  if (stage === "enter-b") return BLINK_ENTER_OPACITY_B;
  if (stage === "exit") return BLINK_EXIT_OPACITY;
  return 1;
}

function rowTransform(stage: BlinkMotionStage): string {
  if (stage === "idle") return "translate3d(0, 0, 0)";
  if (stage === "enter-a") return "translate3d(0, 1px, 0)";
  if (stage === "enter-b") return "translate3d(0, 0.5px, 0)";
  if (stage === "exit") return "translate3d(0, 0.5px, 0)";
  return "translate3d(0, 0, 0)";
}

function rowPaddingTop(stage: BlinkMotionStage): string {
  if (stage === "idle") return "0px";
  if (stage === "enter-a") return `${BLINK_ROW_INSET_A_PX}px`;
  if (stage === "enter-b") return `${BLINK_ROW_INSET_B_PX}px`;
  if (stage === "exit") return `${BLINK_ROW_INSET_B_PX}px`;
  return "0px";
}

function rowOpacity(stage: BlinkMotionStage): number {
  if (stage === "idle") return 0;
  if (stage === "enter-a") return BLINK_ROW_OPACITY_A;
  if (stage === "enter-b") return BLINK_ROW_OPACITY_B;
  if (stage === "exit") return BLINK_ROW_EXIT_OPACITY;
  return 1;
}

function rowGridTemplateRows(stage: BlinkMotionStage): string {
  if (stage === "idle") return "0fr";
  if (stage === "enter-a") return "0.18fr";
  if (stage === "enter-b") return "0.92fr";
  if (stage === "exit") return "0.66fr";
  return "1fr";
}

export function getBlinkContainerMotionStyle(
  stage: BlinkMotionStage,
  prefersReducedMotion: boolean,
  timing: { enterStepMs?: number; enterTotalMs?: number; exitMs?: number } = {},
): React.CSSProperties {
  if (prefersReducedMotion) {
    return { transform: "translate3d(0, 0, 0) scale(1)", opacity: 1, transition: "none" };
  }
  const enterStepMs = timing.enterStepMs ?? BLINK_ENTER_STEP_MS;
  const enterTotalMs = timing.enterTotalMs ?? BLINK_ENTER_TOTAL_MS;
  const exitMs = timing.exitMs ?? BLINK_EXIT_TOTAL_MS;

  return {
    transform: containerTransform(stage),
    opacity: containerOpacity(stage),
    transition: resolveTransition(stage, enterStepMs, enterTotalMs, exitMs),
    transformOrigin: "center center",
    willChange: stage === "steady" ? undefined : "transform,opacity",
  };
}

export function getBlinkRowMotionStyle(
  stage: BlinkMotionStage,
  prefersReducedMotion: boolean,
  timing: { enterStepMs?: number; enterTotalMs?: number; exitMs?: number } = {},
): React.CSSProperties {
  if (prefersReducedMotion) {
    return {
      transform: "translate3d(0, 0, 0)",
      transition: "none",
      paddingTop: "0px",
      display: "grid",
      gridTemplateRows: "1fr",
      opacity: 1,
    };
  }
  const enterStepMs = timing.enterStepMs ?? BLINK_ROW_ENTER_STEP_MS;
  const enterTotalMs = timing.enterTotalMs ?? BLINK_ROW_ENTER_TOTAL_MS;
  const exitMs = timing.exitMs ?? BLINK_ROW_EXIT_TOTAL_MS;

  return {
    transform: rowTransform(stage),
    paddingTop: rowPaddingTop(stage),
    display: "grid",
    gridTemplateRows: rowGridTemplateRows(stage),
    opacity: rowOpacity(stage),
    transition: resolvePaddingTransition(stage, enterStepMs, enterTotalMs, exitMs),
    willChange: stage === "steady" ? undefined : "transform,padding-top,grid-template-rows,opacity",
  };
}
