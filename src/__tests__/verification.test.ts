import { describe, expect, it } from "@jest/globals";
import {
  BLANK_VERIFICATION,
  NOT_FOUND_VERIFICATION_INDEX,
  PENDING_VERIFICATION_INDEX,
  Verification,
} from "../types/verification.js";

describe("verification helpers", () => {
  it("exposes sentinel constants and blank defaults", () => {
    expect(NOT_FOUND_VERIFICATION_INDEX).toBe(-1);
    expect(PENDING_VERIFICATION_INDEX).toBe(-2);
    expect(BLANK_VERIFICATION.pageNumber).toBe(NOT_FOUND_VERIFICATION_INDEX);
    expect(BLANK_VERIFICATION.citation?.pageNumber).toBe(
      NOT_FOUND_VERIFICATION_INDEX
    );
  });
});
