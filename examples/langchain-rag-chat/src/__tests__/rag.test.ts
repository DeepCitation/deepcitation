import { describe, expect, it } from "vitest";
import { summarizeVerifications } from "@/lib/rag";

describe("summarizeVerifications", () => {
  it("counts verified, partial, missed, and pending citations", () => {
    const summary = summarizeVerifications({
      a: { status: "found" },
      b: { status: "partial_text_found" },
      c: { status: "not_found" },
      d: { status: "pending" },
    });

    expect(summary).toEqual({
      total: 4,
      verified: 2,
      partial: 1,
      missed: 1,
      pending: 1,
    });
  });
});
