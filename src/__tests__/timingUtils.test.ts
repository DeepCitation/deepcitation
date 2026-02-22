import { describe, expect, it } from "@jest/globals";
import {
  formatTtc,
  getTtcTier,
  computeTimingMetrics,
  TTC_INSTANT_THRESHOLD_MS,
  TTC_SLOW_THRESHOLD_MS,
  TTC_MAX_DISPLAY_MS,
} from "../react/timingUtils.js";
import type { Verification } from "../types/verification.js";

describe("formatTtc", () => {
  // === Instant threshold (< 100ms) ===

  it('returns "instant" for 0ms', () => {
    expect(formatTtc(0)).toBe("instant");
  });

  it('returns "instant" for 99ms (just below threshold)', () => {
    expect(formatTtc(99)).toBe("instant");
  });

  // === Sub-second range (100-999ms) ===

  it("formats 100ms as 0.1s (one decimal)", () => {
    expect(formatTtc(100)).toBe("0.1s");
  });

  it("formats 500ms as 0.5s", () => {
    expect(formatTtc(500)).toBe("0.5s");
  });

  it("formats 999ms as 1.0s", () => {
    expect(formatTtc(999)).toBe("1.0s");
  });

  // === 1-10 second range (1000-9999ms) ===

  it("formats 1000ms as 1.0s (one decimal)", () => {
    expect(formatTtc(1000)).toBe("1.0s");
  });

  it("formats 2345ms as 2.3s", () => {
    expect(formatTtc(2345)).toBe("2.3s");
  });

  it("formats 9999ms as 10.0s", () => {
    expect(formatTtc(9999)).toBe("10.0s");
  });

  // === 10-60 second range (10000-59999ms) ===

  it("formats 10000ms as 10s (whole seconds)", () => {
    expect(formatTtc(10000)).toBe("10s");
  });

  it("formats 15400ms as 15s (rounds to whole seconds)", () => {
    expect(formatTtc(15400)).toBe("15s");
  });

  it("formats 59999ms as 60s", () => {
    expect(formatTtc(59999)).toBe("60s");
  });

  // === Over 60 seconds (>= 60000ms) ===

  it('formats 60000ms as ">60s"', () => {
    expect(formatTtc(60000)).toBe(">60s");
  });

  it('formats 120000ms as ">60s"', () => {
    expect(formatTtc(120000)).toBe(">60s");
  });

  // === Edge cases ===

  it('returns "instant" for negative input', () => {
    expect(formatTtc(-1)).toBe("instant");
  });

  it('returns "instant" for NaN', () => {
    expect(formatTtc(Number.NaN)).toBe("instant");
  });

  it('returns "instant" for Infinity', () => {
    expect(formatTtc(Number.POSITIVE_INFINITY)).toBe("instant");
  });

  // === Constants verification ===

  it("uses TTC_INSTANT_THRESHOLD_MS constant correctly", () => {
    expect(formatTtc(TTC_INSTANT_THRESHOLD_MS - 1)).toBe("instant");
    expect(formatTtc(TTC_INSTANT_THRESHOLD_MS)).not.toBe("instant");
  });

  it("uses TTC_MAX_DISPLAY_MS constant correctly", () => {
    expect(formatTtc(TTC_MAX_DISPLAY_MS - 1)).not.toBe(">60s");
    expect(formatTtc(TTC_MAX_DISPLAY_MS)).toBe(">60s");
  });
});

describe("getTtcTier", () => {
  // === Fast tier (< 2000ms) ===

  it('returns "fast" for 0ms', () => {
    expect(getTtcTier(0)).toBe("fast");
  });

  it('returns "fast" for 1999ms (just below 2s threshold)', () => {
    expect(getTtcTier(1999)).toBe("fast");
  });

  // === Normal tier (2000-9999ms) ===

  it('returns "normal" for 2000ms (at threshold)', () => {
    expect(getTtcTier(2000)).toBe("normal");
  });

  it('returns "normal" for 5000ms', () => {
    expect(getTtcTier(5000)).toBe("normal");
  });

  it('returns "normal" for 9999ms (just below slow threshold)', () => {
    expect(getTtcTier(9999)).toBe("normal");
  });

  // === Slow tier (>= 10000ms) ===

  it('returns "slow" for 10000ms (at slow threshold)', () => {
    expect(getTtcTier(10000)).toBe("slow");
  });

  it('returns "slow" for 60000ms', () => {
    expect(getTtcTier(60000)).toBe("slow");
  });

  // === Edge cases ===

  it('returns "fast" for negative input', () => {
    expect(getTtcTier(-1)).toBe("fast");
  });

  // === Constants verification ===

  it("uses TTC_SLOW_THRESHOLD_MS constant correctly", () => {
    expect(getTtcTier(TTC_SLOW_THRESHOLD_MS - 1)).toBe("normal");
    expect(getTtcTier(TTC_SLOW_THRESHOLD_MS)).toBe("slow");
  });
});

describe("computeTimingMetrics", () => {
  // === Empty input handling ===

  it("returns null for empty record", () => {
    expect(computeTimingMetrics({})).toBeNull();
  });

  // === No TtC values ===

  it("returns null when no verifications have timeToCertaintyMs", () => {
    const verifications: Record<string, Verification> = {
      key1: {
        status: "pending",
        searchAttempts: [],
      } as Verification,
      key2: {
        status: "loading",
        searchAttempts: [],
      } as Verification,
    };
    expect(computeTimingMetrics(verifications)).toBeNull();
  });

  // === Single entry ===

  it("computes correct metrics for single verification", () => {
    const verifications: Record<string, Verification> = {
      key1: {
        status: "found",
        timeToCertaintyMs: 1500,
        searchAttempts: [{ durationMs: 500 }],
      } as Verification,
    };

    const result = computeTimingMetrics(verifications);
    expect(result).not.toBeNull();
    expect(result?.minTtcMs).toBe(1500);
    expect(result?.maxTtcMs).toBe(1500);
    expect(result?.avgTtcMs).toBe(1500);
    expect(result?.medianTtcMs).toBe(1500);
    expect(result?.resolvedCount).toBe(1);
    expect(result?.totalCount).toBe(1);
    expect(result?.totalSearchDurationMs).toBe(500);
  });

  // === Odd-count median ===

  it("computes correct median for odd number of entries", () => {
    const verifications: Record<string, Verification> = {
      key1: { status: "found", timeToCertaintyMs: 1000 } as Verification,
      key2: { status: "found", timeToCertaintyMs: 3000 } as Verification,
      key3: { status: "found", timeToCertaintyMs: 2000 } as Verification,
    };

    const result = computeTimingMetrics(verifications);
    expect(result?.medianTtcMs).toBe(2000); // Middle value after sorting [1000, 2000, 3000]
  });

  // === Even-count median ===

  it("computes correct median for even number of entries", () => {
    const verifications: Record<string, Verification> = {
      key1: { status: "found", timeToCertaintyMs: 1000 } as Verification,
      key2: { status: "found", timeToCertaintyMs: 2000 } as Verification,
      key3: { status: "found", timeToCertaintyMs: 3000 } as Verification,
      key4: { status: "found", timeToCertaintyMs: 4000 } as Verification,
    };

    const result = computeTimingMetrics(verifications);
    expect(result?.medianTtcMs).toBe(2500); // Average of middle two [2000, 3000]
  });

  // === Mixed resolved/pending verifications ===

  it("counts totalCount and resolvedCount correctly with mixed statuses", () => {
    const verifications: Record<string, Verification> = {
      key1: { status: "found", timeToCertaintyMs: 1000 } as Verification,
      key2: { status: "pending", timeToCertaintyMs: undefined } as Verification,
      key3: { status: "found", timeToCertaintyMs: 2000 } as Verification,
      key4: { status: "loading", timeToCertaintyMs: undefined } as Verification,
    };

    const result = computeTimingMetrics(verifications);
    expect(result?.totalCount).toBe(4);
    expect(result?.resolvedCount).toBe(2);
    expect(result?.avgTtcMs).toBe(1500);
  });

  // === Search duration aggregation ===

  it("aggregates search durations correctly", () => {
    const verifications: Record<string, Verification> = {
      key1: {
        status: "found",
        timeToCertaintyMs: 1000,
        searchAttempts: [{ durationMs: 100 }, { durationMs: 200 }],
      } as Verification,
      key2: {
        status: "found",
        timeToCertaintyMs: 2000,
        searchAttempts: [{ durationMs: 150 }],
      } as Verification,
    };

    const result = computeTimingMetrics(verifications);
    expect(result?.totalSearchDurationMs).toBe(450); // 100 + 200 + 150
  });

  it("handles null durationMs in search attempts", () => {
    const verifications: Record<string, Verification> = {
      key1: {
        status: "found",
        timeToCertaintyMs: 1000,
        searchAttempts: [{ durationMs: 100 }, { durationMs: null }, { durationMs: 200 }],
      } as Verification,
    };

    const result = computeTimingMetrics(verifications);
    expect(result?.totalSearchDurationMs).toBe(300); // Only 100 + 200
  });

  it("handles missing searchAttempts array", () => {
    const verifications: Record<string, Verification> = {
      key1: {
        status: "found",
        timeToCertaintyMs: 1000,
      } as Verification,
    };

    const result = computeTimingMetrics(verifications);
    expect(result?.totalSearchDurationMs).toBe(0);
  });

  // === Min/Max/Avg correctness ===

  it("computes correct min, max, and avg", () => {
    const verifications: Record<string, Verification> = {
      key1: { status: "found", timeToCertaintyMs: 1000 } as Verification,
      key2: { status: "found", timeToCertaintyMs: 5000 } as Verification,
      key3: { status: "found", timeToCertaintyMs: 3000 } as Verification,
    };

    const result = computeTimingMetrics(verifications);
    expect(result?.minTtcMs).toBe(1000);
    expect(result?.maxTtcMs).toBe(5000);
    expect(result?.avgTtcMs).toBe(3000); // (1000 + 5000 + 3000) / 3
  });

  // === Zero TtC ===

  it("handles zero TtC correctly", () => {
    const verifications: Record<string, Verification> = {
      key1: { status: "found", timeToCertaintyMs: 0 } as Verification,
      key2: { status: "found", timeToCertaintyMs: 1000 } as Verification,
    };

    const result = computeTimingMetrics(verifications);
    expect(result?.minTtcMs).toBe(0);
    expect(result?.avgTtcMs).toBe(500);
  });

  // === Constants are exported ===

  it("exports TTC_INSTANT_THRESHOLD_MS constant", () => {
    expect(TTC_INSTANT_THRESHOLD_MS).toBe(100);
  });

  it("exports TTC_SLOW_THRESHOLD_MS constant", () => {
    expect(TTC_SLOW_THRESHOLD_MS).toBe(10_000);
  });

  it("exports TTC_MAX_DISPLAY_MS constant", () => {
    expect(TTC_MAX_DISPLAY_MS).toBe(60_000);
  });
});
