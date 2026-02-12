import { describe, expect, it } from "@jest/globals";
import { formatShortDate } from "../react/dateUtils.js";

describe("formatShortDate", () => {
  it("formats same-year dates without year", () => {
    const date = new Date(`${new Date().getFullYear()}-02-12`);
    expect(formatShortDate(date)).toBe("Feb 12");
  });

  it("includes year for different years", () => {
    const date = new Date("2020-12-31");
    expect(formatShortDate(date)).toBe("Dec 31, 2020");
  });

  it("handles string dates", () => {
    const year = new Date().getFullYear();
    expect(formatShortDate(`${year}-01-15`)).toBe("Jan 15");
  });

  it("handles ISO string dates", () => {
    const year = new Date().getFullYear();
    expect(formatShortDate(`${year}-06-03T14:30:00Z`)).toBe("Jun 3");
  });

  it("returns empty string for invalid dates", () => {
    expect(formatShortDate("invalid")).toBe("");
  });

  it("returns empty string for null", () => {
    expect(formatShortDate(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatShortDate(undefined)).toBe("");
  });
});
