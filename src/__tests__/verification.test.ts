import { describe, expect, it } from "@jest/globals";
import { generateVerificationKey } from "../react/utils.js";
import {
  BLANK_VERIFICATION,
  NOT_FOUND_VERIFICATION_INDEX,
  PENDING_VERIFICATION_INDEX,
  type Verification,
} from "../types/verification.js";

describe("verification helpers", () => {
  it("exposes sentinel constants and blank defaults", () => {
    expect(NOT_FOUND_VERIFICATION_INDEX).toBe(-1);
    expect(PENDING_VERIFICATION_INDEX).toBe(-2);
    expect(BLANK_VERIFICATION.verifiedPageNumber).toBe(
      NOT_FOUND_VERIFICATION_INDEX
    );
    expect(BLANK_VERIFICATION.citation?.pageNumber).toBe(
      NOT_FOUND_VERIFICATION_INDEX
    );
  });

  it("builds deterministic ids from verification attributes", () => {
    const verification: Verification = {
      label: "phrase",
      attachmentId: "file-1",
      verifiedPageNumber: 3,
      hitIndexWithinPage: 2,
      verifiedMatchSnippet: "snippet",
    };
    const first = generateVerificationKey(verification);
    const second = generateVerificationKey(verification);
    expect(first).toBe(second);
  });
});
