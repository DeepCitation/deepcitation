import { describe, expect, it } from "@jest/globals";
import type { ParsedCitationResult } from "../../parsing/parseCitationResponse.js";
import { resolveSourceLabel, walkCitationSegments } from "../../rendering/shared.js";

const PARSED_INPUT: ParsedCitationResult = {
  visibleText: "Hello [1] world [2] end",
  splitPattern: /(\[\d+\])/,
  format: "numeric",
  citations: {
    key1: { type: "document", attachmentId: "att1", pageNumber: 1, lineIds: [], fullPhrase: "hello" },
    key2: {
      type: "url",
      attachmentId: "",
      pageNumber: 0,
      lineIds: [],
      fullPhrase: "world",
      title: "Example",
      url: "https://example.com",
    },
  },
  markerMap: { 1: "key1", 2: "key2" },
};

describe("walkCitationSegments", () => {
  it("splits input into text and citation segments", () => {
    const { segments } = walkCitationSegments(PARSED_INPUT);
    expect(segments).toHaveLength(5);
    expect(segments[0]).toEqual({ type: "text", value: "Hello " });
    expect(segments[1]).toMatchObject({ type: "citation", citationKey: "key1", citationNumber: 1 });
    expect(segments[2]).toEqual({ type: "text", value: " world " });
    expect(segments[3]).toMatchObject({ type: "citation", citationKey: "key2", citationNumber: 2 });
    expect(segments[4]).toEqual({ type: "text", value: " end" });
  });

  it("collects citationsWithStatus array", () => {
    const { citationsWithStatus } = walkCitationSegments(PARSED_INPUT);
    expect(citationsWithStatus).toHaveLength(2);
    expect(citationsWithStatus[0].citationKey).toBe("key1");
    expect(citationsWithStatus[1].citationKey).toBe("key2");
  });

  it("treats unknown markers as text", () => {
    const input: ParsedCitationResult = {
      ...PARSED_INPUT,
      visibleText: "See [99]",
      markerMap: {},
    };
    const { segments } = walkCitationSegments(input);
    expect(segments[0]).toEqual({ type: "text", value: "See " });
    expect(segments[1]).toEqual({ type: "text", value: "[99]" });
    // split may produce trailing empty string segment
    expect(segments.filter(s => s.type === "citation")).toHaveLength(0);
  });

  it("accepts a raw string input", () => {
    // Just verify it doesn't throw — parseCitationResponse handles the string
    const { segments } = walkCitationSegments("No citations here");
    expect(segments.length).toBeGreaterThanOrEqual(1);
    expect(segments[0].type).toBe("text");
  });
});

describe("resolveSourceLabel", () => {
  it("uses sourceLabels for document citations", () => {
    const cws = {
      citation: { type: "document" as const, attachmentId: "att1" },
      verification: null,
      citationNumber: 1,
    };
    expect(resolveSourceLabel(cws as any, { att1: "My Document" })).toBe("My Document");
  });

  it("falls back to Source N", () => {
    const cws = {
      citation: { type: "document" as const, attachmentId: "att1" },
      verification: null,
      citationNumber: 3,
    };
    expect(resolveSourceLabel(cws as any, {})).toBe("Source 3");
  });

  it("uses title for URL citations when no label provided", () => {
    const cws = { citation: { type: "url" as const, title: "Example Page" }, verification: null, citationNumber: 1 };
    expect(resolveSourceLabel(cws as any, {})).toBe("Example Page");
  });
});
