import {
  BLINK_ENTER_EASING,
  BLINK_EXIT_EASING,
  EVIDENCE_LIST_COLLAPSE_TOTAL_MS,
  EVIDENCE_LIST_EXPAND_STEP_MS,
  EVIDENCE_LIST_EXPAND_TOTAL_MS,
} from "../constants.js";

const SETTLE_MS = Math.max(16, EVIDENCE_LIST_EXPAND_TOTAL_MS - EVIDENCE_LIST_EXPAND_STEP_MS);

const TRANSITION_PROPS = ["max-height", "opacity", "padding-top", "transform"] as const;

/** Build a uniform CSS transition for all animated properties at the given duration and easing. */
function buildTransition(ms: number, easing: string): string {
  return TRANSITION_PROPS.map(p => `${p} ${ms}ms ${easing}`).join(", ");
}

// Evidence list expand/collapse uses an inlined motion state machine instead of
// useBlinkMotionStage because it needs proportional height reveal (measuring
// actual scrollHeight via searchLogViewportRef) and per-stage CSS property
// transitions (paddingTop, transform, willChange) that the generic hook doesn't support.
export type EvidenceListMotionStage = "idle" | "enter-a" | "enter-b" | "steady" | "exit-a" | "exit-b";

export function resolveEvidenceListRevealRatio(stage: EvidenceListMotionStage): number {
  if (stage === "idle") return 0;
  if (stage === "enter-a") return 0.2;
  if (stage === "enter-b") return 0.95;
  if (stage === "exit-a") return 0.7;
  if (stage === "exit-b") return 0;
  return 1;
}

export function resolveEvidenceListOpacity(stage: EvidenceListMotionStage): number {
  if (stage === "idle") return 0;
  if (stage === "enter-a") return 0.72;
  if (stage === "enter-b") return 0.88;
  if (stage === "exit-a") return 0.65;
  if (stage === "exit-b") return 0.06;
  return 1;
}

export function resolveEvidenceListPaddingTop(stage: EvidenceListMotionStage): string {
  if (stage === "enter-a") return "4px";
  if (stage === "enter-b" || stage === "exit-a") return "2px";
  return "0px";
}

export function resolveEvidenceListTransform(stage: EvidenceListMotionStage): string {
  if (stage === "enter-a") return "translate3d(0, 1px, 0)";
  if (stage === "enter-b" || stage === "exit-a") return "translate3d(0, 0.5px, 0)";
  return "translate3d(0, 0, 0)";
}

export function resolveEvidenceListTransition(stage: EvidenceListMotionStage): string {
  if (stage === "enter-a" || stage === "idle" || stage === "exit-a") return "none";
  if (stage === "enter-b") return buildTransition(EVIDENCE_LIST_EXPAND_STEP_MS, BLINK_ENTER_EASING);
  if (stage === "steady") return buildTransition(SETTLE_MS, BLINK_ENTER_EASING);
  return buildTransition(EVIDENCE_LIST_COLLAPSE_TOTAL_MS, BLINK_EXIT_EASING);
}

// Combined reducer for search-log animation state — a single dispatch replaces
// the multiple setState calls that the React Compiler flagged as cascading renders.
export type SearchLogAnimState = { mounted: boolean; stage: EvidenceListMotionStage };
export type SearchLogAnimAction =
  | { type: "instant"; show: boolean }
  | { type: "enter" }
  | { type: "stage"; stage: EvidenceListMotionStage }
  | { type: "unmount" };

export function searchLogAnimReducer(state: SearchLogAnimState, action: SearchLogAnimAction): SearchLogAnimState {
  switch (action.type) {
    case "instant":
      return { mounted: action.show, stage: action.show ? "steady" : "idle" };
    case "enter":
      return { mounted: true, stage: "enter-a" };
    case "stage":
      return { ...state, stage: action.stage };
    case "unmount":
      return { mounted: false, stage: "idle" };
  }
}
