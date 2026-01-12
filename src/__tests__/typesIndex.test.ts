import { describe, expect, it } from "@jest/globals";
import { NOT_FOUND_VERIFICATION_INDEX } from "../types/index.js";

describe("types index exports", () => {
  it("re-exports highlight constants", () => {
    expect(NOT_FOUND_VERIFICATION_INDEX).toBe(-1);
  });
});
