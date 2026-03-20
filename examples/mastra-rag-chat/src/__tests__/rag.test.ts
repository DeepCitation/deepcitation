import { describe, expect, it } from "vitest";
import { summarizeVerifications } from "@/lib/rag";

describe("summarizeVerifications", () => {
  it("counts verified, partial, missed, and pending citations as mutually exclusive buckets", () => {
    const summary = summarizeVerifications({
      a: { status: "found" },
      b: { status: "partial_text_found" },
      c: { status: "not_found" },
      d: { status: "pending" },
    });

    expect(summary).toEqual({
      total: 4,
      verified: 1, // only "found"
      partial: 1,  // "partial_text_found" — not double-counted in verified
      missed: 1,
      pending: 1,
    });
  });

  it("partial_text_found goes into partial only, not verified", () => {
    const summary = summarizeVerifications({
      a: { status: "partial_text_found" },
      b: { status: "partial_text_found" },
    });

    expect(summary.partial).toBe(2);
    expect(summary.verified).toBe(0);
  });

  it("handles all-verified input", () => {
    const summary = summarizeVerifications({
      a: { status: "found" },
      b: { status: "found" },
    });

    expect(summary).toEqual({ total: 2, verified: 2, partial: 0, missed: 0, pending: 0 });
  });

  it("handles empty input", () => {
    const summary = summarizeVerifications({});

    expect(summary).toEqual({ total: 0, verified: 0, partial: 0, missed: 0, pending: 0 });
  });

  it("handles all-missed input", () => {
    const summary = summarizeVerifications({
      x: { status: "not_found" },
      y: { status: "not_found" },
    });

    expect(summary).toEqual({ total: 2, verified: 0, partial: 0, missed: 2, pending: 0 });
  });
});
