import { describe, expect, it } from "vitest";
import type { Citation, CitationRecord, SupportingFact } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import { getChildCitationKey, getCitationKey } from "../utils/citationKey.js";
import {
  childCitationFromFact,
  expandSupportingFactsForVerification,
  getSupportingFactVerifications,
} from "../utils/supportingFactExpansion.js";
import { computeCompositeStatus } from "../utils/worstChildStatus.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const parentCitation: Citation = {
  type: "document",
  attachmentId: "court-order-abc",
  sourceContext: "ordered to preserve and segregate all output log data",
  sourceMatch: "preserve and segregate",
  pageNumber: 2,
  lineIds: [12, 13],
  supportingFacts: [
    {
      childIndex: 0,
      sourceMatch: "output log data",
      sourceContext: "preserve and segregate all output log data",
      pageNumber: 2,
      lineIds: [12],
    },
    {
      childIndex: 1,
      sourceMatch: "May 13, 2025",
      sourceContext: "Dated: May 13, 2025\nNew York, New York",
      pageNumber: 5,
      lineIds: [38, 39],
    },
  ],
};

const crossDocFact: SupportingFact = {
  childIndex: 0,
  sourceMatch: "$5 million",
  sourceContext: "shall not exceed $5,000,000",
  attachmentId: "exhibit-b-002",
  pageNumber: 2,
  lineIds: [4],
};

// ---------------------------------------------------------------------------
// getChildCitationKey
// ---------------------------------------------------------------------------

describe("getChildCitationKey", () => {
  it("produces a 16-char hex string", () => {
    const key = getChildCitationKey("abc123", 0);
    expect(key).toHaveLength(16);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces different keys for different child indices", () => {
    const parentKey = getCitationKey(parentCitation);
    const key0 = getChildCitationKey(parentKey, 0);
    const key1 = getChildCitationKey(parentKey, 1);
    expect(key0).not.toBe(key1);
  });

  it("is deterministic", () => {
    const a = getChildCitationKey("parent123", 2);
    const b = getChildCitationKey("parent123", 2);
    expect(a).toBe(b);
  });

  it("differs from the parent key", () => {
    const parentKey = getCitationKey(parentCitation);
    const childKey = getChildCitationKey(parentKey, 0);
    expect(childKey).not.toBe(parentKey);
  });
});

// ---------------------------------------------------------------------------
// childCitationFromFact
// ---------------------------------------------------------------------------

describe("childCitationFromFact", () => {
  it("inherits parent type and attachmentId", () => {
    const child = childCitationFromFact(parentCitation.supportingFacts![0]!, parentCitation);
    expect(child.type).toBe("document");
    expect(child.attachmentId).toBe("court-order-abc");
  });

  it("overrides attachmentId for cross-document facts", () => {
    const child = childCitationFromFact(crossDocFact, parentCitation);
    expect(child.attachmentId).toBe("exhibit-b-002");
  });

  it("uses child sourceMatch and pageNumber", () => {
    const child = childCitationFromFact(parentCitation.supportingFacts![1]!, parentCitation);
    expect(child.sourceMatch).toBe("May 13, 2025");
    expect(child.pageNumber).toBe(5);
  });

  it("strips supportingFacts to prevent recursive nesting", () => {
    const child = childCitationFromFact(parentCitation.supportingFacts![0]!, parentCitation);
    expect((child as Citation & { supportingFacts?: unknown }).supportingFacts).toBeUndefined();
  });

  it("falls back to parent pageNumber when child has none", () => {
    const factWithoutPage: SupportingFact = { childIndex: 0, sourceMatch: "test" };
    const child = childCitationFromFact(factWithoutPage, parentCitation);
    expect(child.pageNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// expandSupportingFactsForVerification
// ---------------------------------------------------------------------------

describe("expandSupportingFactsForVerification", () => {
  it("includes the parent citation unchanged", () => {
    const citations: CitationRecord = { parent1: parentCitation };
    const { expanded } = expandSupportingFactsForVerification(citations);
    expect(expanded.parent1).toBe(parentCitation);
  });

  it("creates child entries keyed by child citation key", () => {
    const citations: CitationRecord = { parent1: parentCitation };
    const { expanded, parentChildMap } = expandSupportingFactsForVerification(citations);

    const childKeys = parentChildMap.parent1;
    expect(childKeys).toHaveLength(2);

    for (const childKey of childKeys!) {
      expect(expanded[childKey]).toBeDefined();
      expect(expanded[childKey]!.type).toBe("document");
    }
  });

  it("does not modify citations without supporting facts", () => {
    const simpleCitation: Citation = {
      type: "document",
      sourceMatch: "simple",
      sourceContext: "a simple fact",
    };
    const citations: CitationRecord = { simple: simpleCitation };
    const { expanded, parentChildMap } = expandSupportingFactsForVerification(citations);
    expect(Object.keys(expanded)).toHaveLength(1);
    expect(parentChildMap.simple).toBeUndefined();
  });

  it("handles mixed citations (some with, some without children)", () => {
    const simpleCitation: Citation = {
      type: "document",
      sourceMatch: "simple",
      sourceContext: "no children here",
    };
    const citations: CitationRecord = {
      parent1: parentCitation,
      simple: simpleCitation,
    };
    const { expanded, parentChildMap } = expandSupportingFactsForVerification(citations);
    // parent + 2 children + simple = 4
    expect(Object.keys(expanded)).toHaveLength(4);
    expect(parentChildMap.parent1).toHaveLength(2);
    expect(parentChildMap.simple).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getSupportingFactVerifications
// ---------------------------------------------------------------------------

describe("getSupportingFactVerifications", () => {
  it("returns verifications in child order", () => {
    const v0: Verification = { status: "found" };
    const v1: Verification = { status: "not_found" };
    const parentChildMap = { parent1: ["child-key-0", "child-key-1"] };
    const verifications = { "child-key-0": v0, "child-key-1": v1 };

    const result = getSupportingFactVerifications("parent1", parentChildMap, verifications);
    expect(result).toEqual([v0, v1]);
  });

  it("returns empty array for citations without children", () => {
    const result = getSupportingFactVerifications("no-children", {}, {});
    expect(result).toEqual([]);
  });

  it("returns undefined for missing verifications", () => {
    const parentChildMap = { parent1: ["key-0", "key-1"] };
    const verifications = { "key-0": { status: "found" } as Verification };

    const result = getSupportingFactVerifications("parent1", parentChildMap, verifications);
    expect(result[0]).toBeDefined();
    expect(result[1]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeCompositeStatus
// ---------------------------------------------------------------------------

describe("computeCompositeStatus", () => {
  const verified: Verification = { status: "found" };
  const miss: Verification = { status: "not_found" };
  const pending: Verification = { status: "pending" };
  const partial: Verification = { status: "found_source_match_only" };

  it("returns verified when all facts are verified", () => {
    const status = computeCompositeStatus(verified, [verified, verified]);
    expect(status.isVerified).toBe(true);
    expect(status.isMiss).toBe(false);
    expect(status.isPending).toBe(false);
    expect(status.isPartialMatch).toBe(false);
  });

  it("returns miss when any child is miss", () => {
    const status = computeCompositeStatus(verified, [verified, miss]);
    expect(status.isMiss).toBe(true);
    expect(status.isVerified).toBe(false);
  });

  it("returns miss when parent is miss even if children are verified", () => {
    const status = computeCompositeStatus(miss, [verified]);
    expect(status.isMiss).toBe(true);
  });

  it("returns pending when any child is pending (and none are miss)", () => {
    const status = computeCompositeStatus(verified, [verified, pending]);
    expect(status.isPending).toBe(true);
    expect(status.isMiss).toBe(false);
  });

  it("miss takes priority over pending", () => {
    const status = computeCompositeStatus(verified, [miss, pending]);
    expect(status.isMiss).toBe(true);
    expect(status.isPending).toBe(false);
  });

  it("returns partial when any child is partial match", () => {
    const status = computeCompositeStatus(verified, [verified, partial]);
    expect(status.isPartialMatch).toBe(true);
    expect(status.isVerified).toBe(true);
  });

  it("handles null/undefined verifications", () => {
    const status = computeCompositeStatus(null, [undefined, null]);
    expect(status.isVerified).toBe(false);
    expect(status.isMiss).toBe(false);
    expect(status.isPending).toBe(false);
  });

  it("handles empty children array", () => {
    const status = computeCompositeStatus(verified, []);
    expect(status.isVerified).toBe(true);
  });
});
