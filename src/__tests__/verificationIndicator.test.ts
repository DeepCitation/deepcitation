import { describe, expect, it } from "@jest/globals";
import type { Verification } from "../types/verification.js";
import { getVerificationTextIndicator } from "../utils/verificationIndicator.js";

describe("getVerificationTextIndicator", () => {
  it("returns pending indicator for null", () => {
    expect(getVerificationTextIndicator(null)).toBe("⌛");
  });

  it("returns pending indicator for undefined", () => {
    expect(getVerificationTextIndicator(undefined)).toBe("⌛");
  });

  it("returns miss indicator for not_found", () => {
    const v = { status: "not_found" } as Verification;
    expect(getVerificationTextIndicator(v)).toBe("❌");
  });

  it("returns verified indicator for exact match", () => {
    const v = { status: "found" } as Verification;
    expect(getVerificationTextIndicator(v)).toBe("☑️");
  });

  it("returns partial indicator for partial match status", () => {
    const v = { status: "found_anchor_text_only" } as Verification;
    expect(getVerificationTextIndicator(v)).toBe("✅");
  });
});
