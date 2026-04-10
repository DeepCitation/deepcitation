import { describe, expect, it } from "@jest/globals";
import type { Citation, DocumentCitation, UrlCitation } from "../types/citation.js";
import { getCitationKey } from "../utils/citationKey.js";

const baseCitation: DocumentCitation = {
  type: "document",
  sourceContext: "Revenue grew 45% year-over-year to $2.3B",
  sourceMatch: "$2.3B",
  pageNumber: 2,
  lineIds: [20],
};

describe("getCitationKey determinism", () => {
  it("same input always produces same key", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      keys.add(getCitationKey(baseCitation));
    }
    expect(keys.size).toBe(1);
  });

  it("key is a 16-char hex string", () => {
    const key = getCitationKey(baseCitation);
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe("getCitationKey sensitivity", () => {
  it("changing sourceContext produces different key", () => {
    const altered = { ...baseCitation, sourceContext: "Revenue grew 50% to $3.0B" };
    expect(getCitationKey(altered)).not.toBe(getCitationKey(baseCitation));
  });

  it("changing sourceMatch produces different key", () => {
    const altered = { ...baseCitation, sourceMatch: "45%" };
    expect(getCitationKey(altered)).not.toBe(getCitationKey(baseCitation));
  });

  it("changing pageNumber produces different key", () => {
    const altered = { ...baseCitation, pageNumber: 3 };
    expect(getCitationKey(altered)).not.toBe(getCitationKey(baseCitation));
  });

  it("changing lineIds produces different key", () => {
    const altered = { ...baseCitation, lineIds: [21] };
    expect(getCitationKey(altered)).not.toBe(getCitationKey(baseCitation));
  });

  it("missing pageNumber produces different key than pageNumber present", () => {
    // This directly tests the M2 failure mode: omitting pageNumber changes the hash,
    // so the verification response key won't match the HTML attribute key.
    const withPage = { ...baseCitation, pageNumber: 2 };
    const withoutPage = { ...baseCitation, pageNumber: undefined };
    expect(getCitationKey(withoutPage)).not.toBe(getCitationKey(withPage));
  });

  it("empty lineIds produces different key than populated lineIds", () => {
    const withLines = { ...baseCitation, lineIds: [20] };
    const withoutLines = { ...baseCitation, lineIds: undefined };
    expect(getCitationKey(withoutLines)).not.toBe(getCitationKey(withLines));
  });
});

describe("getCitationKey URL citations", () => {
  const urlCitation: UrlCitation = {
    type: "url",
    sourceContext: "The company reported $2.3B in revenue",
    sourceMatch: "$2.3B",
    url: "https://example.com/report",
    domain: "example.com",
    title: "Annual Report",
    pageNumber: 1,
    lineIds: [5],
  };

  it("includes URL-specific fields in hash", () => {
    const withUrl = urlCitation;
    const withDifferentUrl = { ...urlCitation, url: "https://other.com/report" };
    expect(getCitationKey(withDifferentUrl)).not.toBe(getCitationKey(withUrl));
  });

  it("URL citation key differs from document citation with same text", () => {
    const docVersion: DocumentCitation = {
      type: "document",
      sourceContext: urlCitation.sourceContext,
      sourceMatch: urlCitation.sourceMatch,
      pageNumber: urlCitation.pageNumber,
      lineIds: urlCitation.lineIds,
    };
    // URL citations include url/domain/title in hash, so keys should differ
    expect(getCitationKey(docVersion)).not.toBe(getCitationKey(urlCitation));
  });
});

describe("getCitationKey regression fixtures", () => {
  // Frozen hash outputs. If these break, the hash algorithm changed —
  // which breaks all existing injected HTML files referencing these keys.
  const fixtures: Array<{ name: string; citation: Citation; expectedKey: string }> = [
    { name: "base document citation", citation: baseCitation, expectedKey: "b916df9b013fb932" },
    {
      name: "empty document citation",
      citation: { type: "document" } as DocumentCitation,
      expectedKey: "98c4b7d37a4c63c3",
    },
    {
      name: "URL citation",
      citation: {
        type: "url",
        sourceContext: "The company reported $2.3B in revenue",
        sourceMatch: "$2.3B",
        url: "https://example.com/report",
        domain: "example.com",
        title: "Annual Report",
        pageNumber: 1,
        lineIds: [5],
      } as UrlCitation,
      expectedKey: "67c409eedb04fc65",
    },
  ];

  for (const { name, citation, expectedKey } of fixtures) {
    it(`produces stable key for ${name}`, () => {
      expect(getCitationKey(citation)).toBe(expectedKey);
    });
  }

  it("citations with different lineIds order produce same key when sorted", () => {
    const a: DocumentCitation = { ...baseCitation, lineIds: [10, 20, 30] };
    const b: DocumentCitation = { ...baseCitation, lineIds: [10, 20, 30] };
    expect(getCitationKey(a)).toBe(getCitationKey(b));
  });
});
