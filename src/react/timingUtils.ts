/**
 * Time to Certainty (TtC) utilities and React hooks.
 *
 * CANONICAL LOCATION for all TtC-related logic:
 * - formatTtc(), getTtcTier() — display formatting
 * - computeTimingMetrics() — aggregate stats
 * - useCitationTiming() — core lifecycle timing hook
 * - useTtcMetrics() — memoized aggregate metrics hook
 *
 * @packageDocumentation
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CitationTimingEvent, TimingMetrics } from "../types/timing.js";
import type { Verification } from "../types/verification.js";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Threshold below which TtC is displayed as "instant" rather than a number */
export const TTC_INSTANT_THRESHOLD_MS = 100;

/** Threshold above which TtC is considered "slow" for visual treatment */
export const TTC_SLOW_THRESHOLD_MS = 10_000;

/** Maximum TtC value to display (anything above shows ">60s") */
export const TTC_MAX_DISPLAY_MS = 60_000;

/** Popover dwell time (ms) required to count as a genuine review */
export const REVIEW_DWELL_THRESHOLD_MS = 2000;

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format a TtC duration in milliseconds to a human-readable string.
 *
 * Rules (designed for ambient, non-anxious display):
 * - < 100ms:       "instant"
 * - 100-999ms:     "0.Xs"     (one decimal, e.g., "0.8s")
 * - 1000-9999ms:   "X.Xs"     (one decimal, e.g., "2.3s")
 * - 10000-59999ms: "XXs"      (whole seconds, e.g., "15s")
 * - >= 60000ms:    ">60s"
 */
export function formatTtc(ms: number): string {
  if (ms < TTC_INSTANT_THRESHOLD_MS) return "instant";
  if (ms >= TTC_MAX_DISPLAY_MS) return ">60s";
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

/**
 * Determine TtC display tier for visual treatment.
 * - "fast": < 2s (confident, trust-building)
 * - "normal": 2-10s (expected pace)
 * - "slow": > 10s (patience-rewarding context)
 */
export function getTtcTier(ms: number): "fast" | "normal" | "slow" {
  if (ms < 2000) return "fast";
  if (ms < TTC_SLOW_THRESHOLD_MS) return "normal";
  return "slow";
}

// =============================================================================
// AGGREGATE METRICS
// =============================================================================

/**
 * Compute aggregate timing metrics across a set of verifications.
 *
 * @param verifications - Record of citationKey → Verification
 * @returns TimingMetrics, or null if no verifications have resolved
 */
export function computeTimingMetrics(verifications: Record<string, Verification>): TimingMetrics | null {
  const entries = Object.values(verifications);
  if (entries.length === 0) return null;

  const ttcValues: number[] = [];
  let totalSearchDurationMs = 0;

  for (const v of entries) {
    if (v.timeToCertaintyMs != null) {
      ttcValues.push(v.timeToCertaintyMs);
    }

    if (v.searchAttempts) {
      for (const attempt of v.searchAttempts) {
        if (attempt.durationMs != null) totalSearchDurationMs += attempt.durationMs;
      }
    }
  }

  if (ttcValues.length === 0) return null;

  ttcValues.sort((a, b) => a - b);
  const sum = ttcValues.reduce((acc, v) => acc + v, 0);
  const medianIdx = Math.floor(ttcValues.length / 2);

  return {
    avgTtcMs: sum / ttcValues.length,
    minTtcMs: ttcValues[0],
    maxTtcMs: ttcValues[ttcValues.length - 1],
    medianTtcMs:
      ttcValues.length % 2 === 0 ? (ttcValues[medianIdx - 1] + ttcValues[medianIdx]) / 2 : ttcValues[medianIdx],
    resolvedCount: ttcValues.length,
    totalCount: entries.length,
    totalSearchDurationMs,
  };
}

// =============================================================================
// REACT HOOKS
// =============================================================================

/** Return type for useCitationTiming hook */
export interface CitationTimingResult {
  /** System TtC: time from component mount to verification resolution (ms) */
  timeToCertaintyMs: number | null;
  /** User review duration from the first dwell-qualified popover close (ms) */
  reviewDurationMs: number | null;
  /** Ref to the firstSeenAt timestamp (exposed for popover telemetry in CitationComponent) */
  firstSeenAtRef: React.RefObject<number | null>;
}

/**
 * Core timing hook for citation lifecycle tracking.
 *
 * Captures:
 * 1. `firstSeenAt` — component mount time (when user first sees the AI claim)
 * 2. System TtC — time until verification resolves
 * 3. Emits `citation_seen` and `evidence_ready` telemetry events
 *
 * Popover open/close tracking is handled separately in CitationComponent
 * since it requires access to the `isHovering` state.
 */
export function useCitationTiming(
  citationKey: string,
  verification: Verification | null | undefined,
  onTimingEvent?: ((event: CitationTimingEvent) => void) | undefined,
): CitationTimingResult {
  const firstSeenAtRef = useRef<number | null>(null);
  const evidenceReadyFiredRef = useRef(false);
  const [ttcMs, setTtcMs] = useState<number | null>(null);
  const [_reviewDurationMs, _setReviewDurationMs] = useState<number | null>(null);

  // Stable callback ref to avoid re-triggering effects when consumer recreates the callback
  const onTimingEventRef = useRef(onTimingEvent);
  onTimingEventRef.current = onTimingEvent;

  // 1. On mount: record firstSeenAt, emit "citation_seen"
  useEffect(() => {
    firstSeenAtRef.current = Date.now();
    onTimingEventRef.current?.({
      event: "citation_seen",
      citationKey,
      timestamp: firstSeenAtRef.current,
      elapsedSinceSeenMs: null,
    });
  }, [citationKey]);

  // 2. When verification transitions to resolved: compute TtC, emit "evidence_ready"
  const hasResult =
    verification?.status != null && verification.status !== "pending" && verification.status !== "loading";

  useEffect(() => {
    if (hasResult && !evidenceReadyFiredRef.current && firstSeenAtRef.current != null) {
      evidenceReadyFiredRef.current = true;
      const now = Date.now();
      const computed = Math.max(0, now - firstSeenAtRef.current);
      setTtcMs(computed);

      // Stamp on the verification object (mutation-safe per codebase pattern)
      if (verification) verification.timeToCertaintyMs = computed;

      onTimingEventRef.current?.({
        event: "evidence_ready",
        citationKey,
        timestamp: now,
        elapsedSinceSeenMs: computed,
        timeToCertaintyMs: computed,
        verificationStatus: verification?.status ?? null,
      });
    }
  }, [hasResult, citationKey, verification]);

  return { timeToCertaintyMs: ttcMs, reviewDurationMs: _reviewDurationMs, firstSeenAtRef };
}

/**
 * Hook that computes aggregate TtC metrics from a VerificationRecord.
 * Re-computes when verifications change (new results arrive).
 */
export function useTtcMetrics(verifications: Record<string, Verification> | null | undefined): TimingMetrics | null {
  return useMemo(() => {
    if (!verifications) return null;
    return computeTimingMetrics(verifications);
  }, [verifications]);
}
