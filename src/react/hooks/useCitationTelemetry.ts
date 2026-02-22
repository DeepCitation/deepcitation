/**
 * Citation popover telemetry hook.
 *
 * Tracks popover open/close events, dwell time, review detection, and
 * spinner staging (active → slow → stale).
 *
 * @packageDocumentation
 */

import { useEffect, useRef, useState } from "react";
import type { SearchStatus } from "../../types/search.js";
import type { CitationTimingEvent } from "../../types/timing.js";
import type { SpinnerStage } from "../CitationStatusIndicator.js";
import { SPINNER_TIMEOUT_MS } from "../constants.js";
import { REVIEW_DWELL_THRESHOLD_MS } from "../timingUtils.js";

export interface UseCitationTelemetryOptions {
  /** Whether the popover is currently hovering/open */
  isHovering: boolean;
  /** Unique citation key */
  citationKey: string;
  /** Current verification status */
  verificationStatus: SearchStatus | null | undefined;
  /** Whether loading state is active */
  isLoading: boolean;
  /** Whether the citation is in pending state */
  isPending: boolean;
  /** Whether a definitive result has been reached */
  hasDefinitiveResult: boolean;
  /** Stable ref to firstSeenAt from useCitationTiming */
  firstSeenAtRef: React.RefObject<number | null>;
  /** Telemetry event callback */
  onTimingEvent?: (event: CitationTimingEvent) => void;
}

export interface UseCitationTelemetryResult {
  /** Current spinner stage: "active" | "slow" | "stale" */
  spinnerStage: SpinnerStage;
  /** Whether the spinner should be shown */
  shouldShowSpinner: boolean;
}

/**
 * Manages popover telemetry (open/close/review events) and spinner staging.
 */
export function useCitationTelemetry({
  isHovering,
  citationKey,
  verificationStatus,
  isLoading,
  isPending,
  hasDefinitiveResult,
  firstSeenAtRef,
  onTimingEvent,
}: UseCitationTelemetryOptions): UseCitationTelemetryResult {
  // Spinner staging
  const [spinnerStage, setSpinnerStage] = useState<SpinnerStage>("active");
  const spinnerTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    for (const t of spinnerTimeoutsRef.current) clearTimeout(t);
    spinnerTimeoutsRef.current = [];

    if ((isLoading || isPending) && !hasDefinitiveResult) {
      setSpinnerStage("active");
      spinnerTimeoutsRef.current.push(
        setTimeout(() => setSpinnerStage("slow"), SPINNER_TIMEOUT_MS),
        setTimeout(() => setSpinnerStage("stale"), SPINNER_TIMEOUT_MS * 3),
      );
    } else {
      setSpinnerStage("active");
    }

    return () => {
      for (const t of spinnerTimeoutsRef.current) clearTimeout(t);
    };
  }, [isLoading, isPending, hasDefinitiveResult]);

  const shouldShowSpinner = (isLoading || isPending) && !hasDefinitiveResult && spinnerStage !== "stale";

  // Popover telemetry
  const popoverOpenedAtRef = useRef<number | null>(null);
  const reviewedRef = useRef(false);

  // Stable ref for onTimingEvent to avoid re-triggering effects
  const onTimingEventRef = useRef(onTimingEvent);
  onTimingEventRef.current = onTimingEvent;

  // biome-ignore lint/correctness/useExhaustiveDependencies: firstSeenAtRef is stable ref — only isHovering transitions should trigger this effect
  useEffect(() => {
    if (isHovering && firstSeenAtRef.current != null) {
      popoverOpenedAtRef.current = performance.now();
      onTimingEventRef.current?.({
        event: "popover_opened",
        citationKey,
        timestamp: Date.now(),
        elapsedSinceSeenMs: popoverOpenedAtRef.current - firstSeenAtRef.current,
        verificationStatus: verificationStatus ?? null,
      });
    } else if (!isHovering && popoverOpenedAtRef.current != null) {
      const now = performance.now();
      const dwellMs = now - popoverOpenedAtRef.current;

      onTimingEventRef.current?.({
        event: "popover_closed",
        citationKey,
        timestamp: Date.now(),
        elapsedSinceSeenMs: firstSeenAtRef.current != null ? now - firstSeenAtRef.current : null,
        popoverDurationMs: dwellMs,
        verificationStatus: verificationStatus ?? null,
      });

      // Dwell threshold: if user spent >=2s AND hasn't already been marked reviewed
      if (dwellMs >= REVIEW_DWELL_THRESHOLD_MS && !reviewedRef.current) {
        reviewedRef.current = true;
        onTimingEventRef.current?.({
          event: "citation_reviewed",
          citationKey,
          timestamp: Date.now(),
          elapsedSinceSeenMs: firstSeenAtRef.current != null ? now - firstSeenAtRef.current : null,
          popoverDurationMs: dwellMs,
          verificationStatus: verificationStatus ?? null,
          userTtcMs: firstSeenAtRef.current != null ? now - firstSeenAtRef.current : undefined,
        });
      }

      popoverOpenedAtRef.current = null;
    }
  }, [isHovering, citationKey, verificationStatus]);

  return { spinnerStage, shouldShowSpinner };
}
