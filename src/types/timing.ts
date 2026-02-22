/**
 * Timing types for Time to Certainty (TtC) tracking.
 *
 * TtC measures the user's review journey: from seeing an AI-generated citation
 * to personally confirming it via the verification evidence popover.
 *
 * @packageDocumentation
 */

/**
 * Aggregate timing metrics across a set of citations.
 * Computed client-side from individual Verification.timeToCertaintyMs values.
 */
export interface TimingMetrics {
  /** Average TtC across all resolved citations (ms) */
  avgTtcMs: number;
  /** Minimum TtC (fastest verification) (ms) */
  minTtcMs: number;
  /** Maximum TtC (slowest verification) (ms) */
  maxTtcMs: number;
  /** Median TtC (ms) */
  medianTtcMs: number;
  /** Number of citations that have reached terminal state */
  resolvedCount: number;
  /** Total number of citations (including pending) */
  totalCount: number;
  /** Sum of all search attempt durations from the API (ms) */
  totalSearchDurationMs: number;
}

/**
 * A single telemetry event emitted during the citation review lifecycle.
 * Consumers provide an `onTimingEvent` callback to receive these events.
 *
 * Event sequence:
 * 1. `citation_seen` — component mounts, user sees the AI claim
 * 2. `evidence_ready` — verification resolves, evidence available for review
 * 3. `popover_opened` — user opens the citation popover
 * 4. `popover_closed` — user closes the citation popover
 * 5. `citation_reviewed` — dwell threshold met (≥2s), counts as genuine review
 */
export interface CitationTimingEvent {
  /** What happened */
  event: "citation_seen" | "evidence_ready" | "popover_opened" | "popover_closed" | "citation_reviewed";
  /** Unique key for this citation */
  citationKey: string;
  /** Wall-clock timestamp (ms epoch) */
  timestamp: number;
  /** Time since citation was first seen (ms), null for "citation_seen" event */
  elapsedSinceSeenMs: number | null;
  /** Verification status at time of event, if available */
  verificationStatus?: string | null;
  /** For popover_closed: duration popover was open (ms) */
  popoverDurationMs?: number;
  /** For evidence_ready: the computed system TtC (ms) */
  timeToCertaintyMs?: number;
  /** For citation_reviewed: full user TtC from first seen to review confirmed (ms) */
  userTtcMs?: number;
}
