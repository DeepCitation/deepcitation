import { describe, expect, it } from "bun:test";
import { getVerificationKey } from "../utils/citationKey.js";
describe("verification helpers", () => {
    it("builds deterministic ids from verification attributes", () => {
        const verification = {
            label: "phrase",
            attachmentId: "file-1",
            document: {
                verifiedPageNumber: 3,
                hitIndexWithinPage: 2,
            },
            sourceSnippet: "snippet",
        };
        const first = getVerificationKey(verification);
        const second = getVerificationKey(verification);
        expect(first).toBe(second);
    });
});
