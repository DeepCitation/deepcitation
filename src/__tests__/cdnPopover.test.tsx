import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "fs";
import { resolve } from "path";
import React, { useState } from "react";
import type { PopoverViewState } from "../react/DefaultPopoverContent.js";
import { DefaultPopoverContent } from "../react/DefaultPopoverContent.js";
import { resolveKeyMap } from "../vanilla/runtime/cdn-keymap.js";
import { mapToCitation, mapToVerification } from "../vanilla/runtime/cdn-mappers.js";
import type { VerificationData } from "../vanilla/runtime/types.js";

afterEach(cleanup);

const EVIDENCE_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
const PAGE_IMAGE_URL = "https://cdn.deepcitation.com/proof/page1.avif";
const fullData: VerificationData = {
  status: "found",
  label: "Test Document",
  verifiedFullPhrase: "The quick brown fox jumps over the lazy dog.",
  verifiedAnchorText: "quick brown fox",
  verifiedMatchSnippet: "The quick brown fox jumps",
  evidence: { src: EVIDENCE_SRC, dimensions: { width: 800, height: 150 } },
  document: { verifiedPageNumber: 3, mimeType: "application/pdf" },
  url: {
    verifiedUrl: "https://example.com/doc.pdf",
    verifiedTitle: "Example Document",
    verifiedDomain: "example.com",
    verifiedFaviconUrl: "https://example.com/favicon.ico",
  },
  citation: { fullPhrase: "The quick brown fox", anchorText: "brown fox", type: "url" },
  searchAttempts: [
    {
      method: "exact_line_match",
      success: true,
      searchPhrase: "The quick brown fox",
      pageSearched: 3,
      searchScope: "line",
      note: "Searching line IDs 5",
      durationMs: 0.12,
    },
  ],
  pageImages: [
    { pageNumber: 3, dimensions: { width: 1200, height: 1600 }, imageUrl: PAGE_IMAGE_URL, isMatchPage: true },
    {
      pageNumber: 4,
      dimensions: { width: 1200, height: 1600 },
      imageUrl: "https://cdn.deepcitation.com/proof/page2.avif",
    },
  ],
};
const minData: VerificationData = { status: "not_found" };

describe("mapToVerification", () => {
  it("maps all fields", () => {
    const r = mapToVerification(fullData);
    expect(r.status).toBe("found");
    expect(r.label).toBe("Test Document");
    expect(r.verifiedFullPhrase).toBe("The quick brown fox jumps over the lazy dog.");
  });
  it("preserves evidence image", () => {
    const r = mapToVerification(fullData);
    expect(r.evidence).toBeDefined();
    expect(r.evidence?.src).toBe(EVIDENCE_SRC);
    expect(r.evidence?.dimensions).toEqual({ width: 800, height: 150 });
  });
  it("sets evidence undefined when no src", () => {
    const r = mapToVerification({ ...fullData, evidence: { dimensions: { width: 100, height: 50 } } });
    expect(r.evidence).toBeUndefined();
  });
  it("sets evidence undefined when absent", () => {
    expect(mapToVerification(minData).evidence).toBeUndefined();
  });
  it("preserves pageImages array", () => {
    const r = mapToVerification(fullData);
    expect(r.pageImages).toHaveLength(2);
    expect(r.pageImages?.[0]).toEqual({
      pageNumber: 3,
      dimensions: { width: 1200, height: 1600 },
      imageUrl: PAGE_IMAGE_URL,
      isMatchPage: true,
    });
    expect(r.pageImages?.[1].pageNumber).toBe(4);
  });
  it("sets pageImages undefined when absent", () => {
    expect(mapToVerification(minData).pageImages).toBeUndefined();
  });
  it("preserves searchAttempts array", () => {
    const r = mapToVerification(fullData);
    expect(r.searchAttempts).toHaveLength(1);
    expect(r.searchAttempts?.[0].method).toBe("exact_line_match");
    expect(r.searchAttempts?.[0].success).toBe(true);
    expect(r.searchAttempts?.[0].searchPhrase).toBe("The quick brown fox");
  });
  it("sets searchAttempts undefined when absent", () => {
    expect(mapToVerification(minData).searchAttempts).toBeUndefined();
  });
  it("maps document metadata", () => {
    expect(mapToVerification(fullData).document).toEqual(
      expect.objectContaining({ verifiedPageNumber: 3, mimeType: "application/pdf" }),
    );
  });
  it("maps URL metadata", () => {
    expect(mapToVerification(fullData).url).toEqual({
      verifiedUrl: "https://example.com/doc.pdf",
      verifiedTitle: "Example Document",
      verifiedDomain: "example.com",
      verifiedFaviconUrl: "https://example.com/favicon.ico",
    });
  });
  it("handles minimal data", () => {
    const r = mapToVerification(minData);
    expect(r.status).toBe("not_found");
    expect(r.evidence).toBeUndefined();
    expect(r.pageImages).toBeUndefined();
    expect(r.document).toBeUndefined();
    expect(r.url).toBeUndefined();
  });
});

describe("mapToCitation", () => {
  it("creates url citation", () => {
    const r = mapToCitation(fullData);
    expect(r.type).toBe("url");
    expect(r.fullPhrase).toBe("The quick brown fox");
    if (r.type === "url") {
      expect(r.url).toBe("https://example.com/doc.pdf");
      expect(r.domain).toBe("example.com");
    }
  });
  it("creates document citation", () => {
    const r = mapToCitation({
      ...fullData,
      citation: { fullPhrase: "Some phrase", anchorText: "phrase", type: "document" },
    });
    expect(r.type).toBe("document");
  });
  it("defaults to document when type absent", () => {
    expect(mapToCitation({ ...fullData, citation: { fullPhrase: "Test" } }).type).toBe("document");
  });
  it("falls back to verifiedFullPhrase", () => {
    expect(mapToCitation({ ...fullData, citation: undefined }).fullPhrase).toBe(
      "The quick brown fox jumps over the lazy dog.",
    );
  });
  it("returns empty string when both absent", () => {
    expect(mapToCitation(minData).fullPhrase).toBe("");
  });
});

describe("CDN popover viewState contract", () => {
  it("wrapper pattern provides onViewStateChange", () => {
    function TestWrapper() {
      const [viewState, setViewState] = useState<PopoverViewState>("summary");
      return (
        <DefaultPopoverContent
          citation={{ type: "document", fullPhrase: "Test" }}
          verification={{ status: "found", evidence: { src: EVIDENCE_SRC } }}
          status={{ isVerified: true, isMiss: false, isPartialMatch: false, isPending: false }}
          viewState={viewState}
          onViewStateChange={setViewState}
        />
      );
    }
    const { container } = render(<TestWrapper />);
    expect(
      container.querySelector("[data-dc-evidence-zone]") || container.querySelector("[data-dc-keyhole]"),
    ).toBeTruthy();
  });
  it("receives pageImages prop", () => {
    const pageImages = [
      { pageNumber: 1, dimensions: { width: 800, height: 1200 }, imageUrl: PAGE_IMAGE_URL, isMatchPage: true as const },
    ];
    function TestWrapper() {
      const [viewState, setViewState] = useState<PopoverViewState>("summary");
      return (
        <DefaultPopoverContent
          citation={{ type: "document", fullPhrase: "Test" }}
          verification={{ status: "found", evidence: { src: EVIDENCE_SRC } }}
          pageImages={pageImages}
          status={{ isVerified: true, isMiss: false, isPartialMatch: false, isPending: false }}
          viewState={viewState}
          onViewStateChange={setViewState}
        />
      );
    }
    const { container } = render(<TestWrapper />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe("cdn.ts source invariants", () => {
  const cdnSource = readFileSync(resolve(__dirname, "../vanilla/runtime/cdn.ts"), "utf-8");
  it("uses CdnPopoverWrapper", () => {
    expect(cdnSource).toContain("createElement(CdnPopoverWrapper");
    expect(cdnSource).not.toMatch(/render\(\s*createElement\(\s*DefaultPopoverContent/);
  });
  it("passes onViewStateChange", () => {
    expect(cdnSource).toContain("onViewStateChange: setViewState");
  });
  it("uses useState for viewState", () => {
    expect(cdnSource).toContain("useState<PopoverViewState>");
  });
  it("imports from cdn-mappers", () => {
    expect(cdnSource).toContain('from "./cdn-mappers.js"');
  });
  it("passes pageImages", () => {
    expect(cdnSource).toContain("pageImages: verification.pageImages");
  });
  it("sets max-width on content container", () => {
    expect(cdnSource).toContain('maxWidth = "calc(100vw - 2rem)"');
  });
  it("sets width max-content on wrapper", () => {
    expect(cdnSource).toContain('width = "max-content"');
  });
  it("creates status indicator icons", () => {
    expect(cdnSource).toContain("createStatusIndicator");
    expect(cdnSource).toContain("dc-status-indicator");
  });
  it("uses checkmark for both verified and partial (not warning triangle)", () => {
    // Partial match uses CHECK_SVG (amber checkmark), same icon as verified — NOT a warning triangle
    expect(cdnSource).toContain("CHECK_SVG");
    expect(cdnSource).toContain("X_SVG");
    expect(cdnSource).not.toContain("WARNING_SVG");
  });
  it("supports indicator variant option", () => {
    expect(cdnSource).toContain("indicatorVariant");
    expect(cdnSource).toContain("activeIndicatorVariant");
  });
  it("imports resolveKeyMap from cdn-keymap", () => {
    expect(cdnSource).toContain('from "./cdn-keymap.js"');
    expect(cdnSource).toContain("resolveKeyMap()");
  });
});

describe("resolveKeyMap DOM behavior", () => {
  afterEach(() => {
    document.getElementById("dc-key-map")?.remove();
    document.querySelectorAll("[data-cite]").forEach(el => el.remove());
    document.querySelectorAll("[data-citation-key]").forEach(el => el.remove());
  });

  function injectKeyMap(map: Record<string, unknown>) {
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = "dc-key-map";
    script.textContent = JSON.stringify(map);
    document.body.appendChild(script);
  }

  function addCiteEl(humanKey: string): HTMLElement {
    const el = document.createElement("span");
    el.setAttribute("data-cite", humanKey);
    document.body.appendChild(el);
    return el;
  }

  it("resolves data-cite to data-citation-key", () => {
    injectKeyMap({ "my claim": "abc123" });
    const el = addCiteEl("my claim");
    resolveKeyMap();
    expect(el.getAttribute("data-citation-key")).toBe("abc123");
  });

  it("ignores keys not in the map", () => {
    injectKeyMap({ "my claim": "abc123" });
    const el = addCiteEl("unknown claim");
    resolveKeyMap();
    expect(el.hasAttribute("data-citation-key")).toBe(false);
  });

  it("skips non-string values in the map", () => {
    injectKeyMap({ "my claim": null as unknown as string, other: 42 as unknown as string });
    const el1 = addCiteEl("my claim");
    const el2 = addCiteEl("other");
    resolveKeyMap();
    expect(el1.hasAttribute("data-citation-key")).toBe(false);
    expect(el2.hasAttribute("data-citation-key")).toBe(false);
  });

  it("handles malformed JSON gracefully", () => {
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = "dc-key-map";
    script.textContent = "NOT VALID JSON";
    document.body.appendChild(script);
    const el = addCiteEl("anything");
    resolveKeyMap(); // should not throw
    expect(el.hasAttribute("data-citation-key")).toBe(false);
  });

  it("is a no-op when no dc-key-map element exists", () => {
    const el = addCiteEl("my claim");
    resolveKeyMap(); // should not throw
    expect(el.hasAttribute("data-citation-key")).toBe(false);
  });

  it("ignores non-object key map shapes (array, null, primitive)", () => {
    for (const value of [["abc"], null, 42, "string"]) {
      injectKeyMap(value as unknown as Record<string, unknown>);
      const el = addCiteEl("my claim");
      resolveKeyMap(); // should not throw
      expect(el.hasAttribute("data-citation-key")).toBe(false);
      document.getElementById("dc-key-map")?.remove();
      el.remove();
    }
  });

  // Tests for the current /verify workflow: data-citation-key with human-readable values
  function addCitationKeyEl(humanKey: string): HTMLElement {
    const el = document.createElement("span");
    el.setAttribute("data-citation-key", humanKey);
    document.body.appendChild(el);
    return el;
  }

  it("resolves data-citation-key human-readable values to hashed keys", () => {
    injectKeyMap({ "cite-revenue": "bfd6ec10bd261161" });
    const el = addCitationKeyEl("cite-revenue");
    resolveKeyMap();
    expect(el.getAttribute("data-citation-key")).toBe("bfd6ec10bd261161");
  });

  it("leaves data-citation-key unchanged if value is not in the key map", () => {
    injectKeyMap({ "cite-revenue": "bfd6ec10bd261161" });
    const el = addCitationKeyEl("already-hashed-key");
    resolveKeyMap();
    expect(el.getAttribute("data-citation-key")).toBe("already-hashed-key");
  });

  it("handles mixed data-cite and data-citation-key elements", () => {
    injectKeyMap({ "claim-a": "hash-a", "claim-b": "hash-b" });
    const legacyEl = addCiteEl("claim-a");
    const currentEl = addCitationKeyEl("claim-b");
    resolveKeyMap();
    expect(legacyEl.getAttribute("data-citation-key")).toBe("hash-a");
    expect(currentEl.getAttribute("data-citation-key")).toBe("hash-b");
  });
});
