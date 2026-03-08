import { describe, expect, it } from "@jest/globals";
import type { Verification } from "../types/verification.js";
import { getVerificationKey } from "../utils/citationKey.js";

describe("verification helpers", () => {
  it("builds deterministic ids from verification attributes", () => {
    const verification: Verification = {
      label: "phrase",
      attachmentId: "file-1",
      document: {
        verifiedPageNumber: 3,
        hitIndexWithinPage: 2,
      },
      verifiedMatchSnippet: "snippet",
    };
    const first = getVerificationKey(verification);
    const second = getVerificationKey(verification);
    expect(first).toBe(second);
  });
});
