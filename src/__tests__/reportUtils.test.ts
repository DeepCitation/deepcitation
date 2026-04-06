import { describe, expect, it } from "@jest/globals";
import type { Citation } from "../types/citation.js";
import type { Verification } from "../types/verification.js";
import {
  buildCitationMaps,
  injectCdnRuntime,
  reattachPageImages,
  replaceCitationMarkers,
} from "../vanilla/reportUtils.js";

describe("buildCitationMaps", () => {
  it("builds anchorMap and keyMap from CitationRecord", () => {
    const citations: Record<string, Citation> = {
      hash1: { type: "document", citationNumber: 1, anchorText: "claim one" },
      hash2: { type: "document", citationNumber: 2, anchorText: "claim two" },
    };
    const { anchorMap, keyMap } = buildCitationMaps(citations);
    expect(anchorMap).toEqual({ "1": "claim one", "2": "claim two" });
    expect(keyMap).toEqual({ "cite-1": "hash1", "cite-2": "hash2" });
  });

  it("skips citations without citationNumber or anchorText", () => {
    const citations: Record<string, Citation> = {
      hash1: { type: "document", citationNumber: 1 },
      hash2: { type: "document", anchorText: "no number" },
      hash3: { type: "document", citationNumber: 3, anchorText: "valid" },
    };
    const { anchorMap, keyMap } = buildCitationMaps(citations);
    expect(anchorMap).toEqual({ "3": "valid" });
    expect(keyMap).toEqual({ "cite-3": "hash3" });
  });

  it("returns empty maps for empty input", () => {
    const { anchorMap, keyMap } = buildCitationMaps({});
    expect(anchorMap).toEqual({});
    expect(keyMap).toEqual({});
  });
});

describe("replaceCitationMarkers", () => {
  it("replaces data-cite with data-citation-key and strips [N] markers", () => {
    const html = '<span data-cite="1">claim</span> text [1] end';
    const citations: Record<string, Citation> = {
      abc123: { type: "document", citationNumber: 1, anchorText: "claim" },
    };
    const result = replaceCitationMarkers(html, citations);
    expect(result).toBe('<span data-citation-key="abc123">claim</span> text end');
  });

  it("handles multiple citations", () => {
    const html = '<span data-cite="1">a</span> [1] <span data-cite="2">b</span> [2]';
    const citations: Record<string, Citation> = {
      h1: { type: "document", citationNumber: 1, anchorText: "a" },
      h2: { type: "document", citationNumber: 2, anchorText: "b" },
    };
    const result = replaceCitationMarkers(html, citations);
    expect(result).toContain('data-citation-key="h1"');
    expect(result).toContain('data-citation-key="h2"');
    expect(result).not.toContain("[1]");
    expect(result).not.toContain("[2]");
  });
});

describe("reattachPageImages", () => {
  it("copies pageImages from attachments onto matching verifications", () => {
    const pageImages = [
      { pageNumber: 1, dimensions: { width: 800, height: 1200 }, imageUrl: "https://example.com/p1.avif" },
    ];
    const verifications: Record<string, Verification> = {
      k1: { status: "found", attachmentId: "att-1" } as Verification,
      k2: { status: "found", attachmentId: "att-2" } as Verification,
    };
    reattachPageImages(verifications, { "att-1": { pageImages } });
    expect((verifications.k1 as Record<string, unknown>).pageImages).toBe(pageImages);
    expect((verifications.k2 as Record<string, unknown>).pageImages).toBeUndefined();
  });

  it("no-ops when attachments is undefined", () => {
    const verifications: Record<string, Verification> = {
      k1: { status: "found", attachmentId: "att-1" } as Verification,
    };
    reattachPageImages(verifications, undefined);
    expect((verifications.k1 as Record<string, unknown>).pageImages).toBeUndefined();
  });
});

describe("injectCdnRuntime", () => {
  it("injects scripts before </body>", () => {
    const html = "<html><body><p>Hello</p></body></html>";
    const result = injectCdnRuntime(html, { k: "v" }, { "cite-1": "hash1" });
    expect(result.html).toContain('id="dc-data"');
    expect(result.html).toContain('id="dc-key-map"');
    expect(result.html).toContain("DeepCitationPopover");
    expect(result.html).toContain('theme:"auto"');
    expect(result.html).toMatch(/dc-data[\s\S]*dc-key-map[\s\S]*<\/body>/);
  });

  it("respects theme and indicatorVariant options", () => {
    const html = "<html><body></body></html>";
    const result = injectCdnRuntime(html, {}, {}, { theme: "dark", indicatorVariant: "dot" });
    expect(result.html).toContain('theme:"dark"');
    expect(result.html).toContain('indicatorVariant:"dot"');
  });

  it("omits indicatorVariant from init call when set to icon (default)", () => {
    const html = "<html><body></body></html>";
    const result = injectCdnRuntime(html, {}, {}, { indicatorVariant: "icon" });
    // The init call should only have theme, not indicatorVariant
    const initMatch = result.html.match(/DeepCitationPopover\.init\(\{([^}]+)\}\)/);
    expect(initMatch).toBeTruthy();
    expect(initMatch?.[1]).not.toContain("indicatorVariant");
  });

  it("falls back to </html> when no </body>", () => {
    const html = "<html><p>Hello</p></html>";
    const result = injectCdnRuntime(html, {}, {});
    expect(result.html).toMatch(/dc-data[\s\S]*<\/html>/);
  });

  it("appends when neither </body> nor </html> present", () => {
    const html = "<p>Hello</p>";
    const result = injectCdnRuntime(html, {}, {});
    expect(result.html).toContain("dc-data");
  });

  it("strips existing injection and reports hadExisting", () => {
    const html = '<body><script type="application/json" id="dc-data">{"old":"data"}</script></body>';
    const result = injectCdnRuntime(html, { new: "data" }, {});
    expect(result.hadExisting).toBe(true);
    // Should only have ONE dc-data block
    const matches = result.html.match(/id="dc-data"/g);
    expect(matches).toHaveLength(1);
  });
});
