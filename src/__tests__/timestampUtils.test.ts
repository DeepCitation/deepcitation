import { describe, expect, it } from "@jest/globals";
import { formatTimestamp, formatTimestampRange } from "../react/timestampUtils.js";

describe("formatTimestamp", () => {
  it("formats minutes and seconds (no hours)", () => {
    expect(formatTimestamp("00:01:30.500")).toBe("1:30");
  });

  it("formats with hours when non-zero", () => {
    expect(formatTimestamp("01:15:00.000")).toBe("1:15:00");
  });

  it("zero-pads seconds under 10", () => {
    expect(formatTimestamp("00:00:05.200")).toBe("0:05");
  });

  it("handles zero timestamp", () => {
    expect(formatTimestamp("00:00:00.000")).toBe("0:00");
  });

  it("handles double-digit hours", () => {
    expect(formatTimestamp("10:05:03.000")).toBe("10:05:03");
  });

  it("handles timestamp without milliseconds", () => {
    expect(formatTimestamp("00:02:45")).toBe("2:45");
  });

  it("returns malformed input unchanged", () => {
    expect(formatTimestamp("not-a-timestamp")).toBe("not-a-timestamp");
  });

  it("returns empty string unchanged", () => {
    expect(formatTimestamp("")).toBe("");
  });
});

describe("formatTimestampRange", () => {
  it("formats both start and end with en-dash", () => {
    expect(formatTimestampRange("00:01:30.500", "00:02:15.000")).toBe("1:30 \u2013 2:15");
  });

  it("returns formatted start when only start provided", () => {
    expect(formatTimestampRange("00:01:30.500")).toBe("1:30");
  });

  it("returns formatted end when only end provided", () => {
    expect(formatTimestampRange(undefined, "00:02:15.000")).toBe("2:15");
  });

  it("returns empty string when neither provided", () => {
    expect(formatTimestampRange()).toBe("");
  });
});
