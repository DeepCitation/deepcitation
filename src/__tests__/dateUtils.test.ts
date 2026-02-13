import { describe, expect, it } from "@jest/globals";
import { formatCaptureDate } from "../react/dateUtils.js";

describe("formatCaptureDate", () => {
  // === Null/invalid input handling ===

  it("returns null for null input", () => {
    expect(formatCaptureDate(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(formatCaptureDate(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(formatCaptureDate("")).toBeNull();
  });

  it("returns null for invalid date string", () => {
    expect(formatCaptureDate("not-a-date")).toBeNull();
  });

  it("returns null for nonsense string", () => {
    expect(formatCaptureDate("abc123xyz")).toBeNull();
  });

  // === Date object formatting ===

  it("formats a Date object", () => {
    const date = new Date("2026-01-15T15:42:00Z");
    const result = formatCaptureDate(date);
    expect(result).not.toBeNull();
    expect(result?.display).toMatch(/Jan\s+15/);
    expect(result?.tooltip).toBe(date.toISOString());
  });

  // === ISO string formatting ===

  it("formats an ISO string", () => {
    const result = formatCaptureDate("2026-06-20T10:30:00Z");
    expect(result).not.toBeNull();
    expect(result?.display).toMatch(/Jun\s+20/);
    expect(result?.tooltip).toContain("2026-06-20");
  });

  it("handles ISO string without timezone", () => {
    const result = formatCaptureDate("2026-01-15T15:42:00");
    expect(result).not.toBeNull();
    expect(result?.display).toMatch(/Jan\s+15/);
    expect(result?.tooltip).toContain("2026-01-15");
  });

  // === Year display logic ===

  it("includes year for different-year dates", () => {
    const result = formatCaptureDate("2024-03-10T12:00:00Z");
    expect(result).not.toBeNull();
    expect(result?.display).toMatch(/2024/);
  });

  it("omits year for same-year dates", () => {
    const now = new Date();
    const sameYear = new Date(now.getFullYear(), 5, 15, 12, 0, 0);
    const result = formatCaptureDate(sameYear);
    expect(result).not.toBeNull();
    expect(result?.display).not.toMatch(new RegExp(`${now.getFullYear()}`));
  });

  // === showTime option ===

  it("includes time when showTime is true", () => {
    const result = formatCaptureDate("2026-01-15T15:42:00Z", { showTime: true });
    expect(result).not.toBeNull();
    expect(result?.display).toMatch(/at\s+\d+:\d+/);
  });

  it("excludes time when showTime is false", () => {
    const result = formatCaptureDate("2026-01-15T15:42:00Z", { showTime: false });
    expect(result).not.toBeNull();
    expect(result?.display).not.toContain("at");
  });

  it("excludes time by default", () => {
    const result = formatCaptureDate("2026-01-15T15:42:00Z");
    expect(result).not.toBeNull();
    expect(result?.display).not.toContain("at");
  });

  // === Tooltip format ===

  it("tooltip always contains ISO 8601 string", () => {
    const result = formatCaptureDate("2026-01-15T15:42:00Z");
    expect(result).not.toBeNull();
    expect(result?.tooltip).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // === Edge cases ===

  it("handles very old dates", () => {
    const result = formatCaptureDate("1970-01-01T00:00:00Z");
    expect(result).not.toBeNull();
    expect(result?.display).toMatch(/1970/);
  });

  it("handles future dates", () => {
    const result = formatCaptureDate("2030-12-31T23:59:59Z");
    expect(result).not.toBeNull();
    expect(result?.display).toMatch(/Dec\s+31.*2030/);
  });

  it("handles leap day", () => {
    const result = formatCaptureDate("2024-02-29T12:00:00Z");
    expect(result).not.toBeNull();
    expect(result?.display).toMatch(/Feb\s+29/);
  });

  it("handles date-only string", () => {
    const result = formatCaptureDate("2025-06-15");
    expect(result).not.toBeNull();
    expect(result?.display).toMatch(/Jun\s+15/);
  });
});
