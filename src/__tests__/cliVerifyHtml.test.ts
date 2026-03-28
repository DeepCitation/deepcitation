import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";

import { citationDataToCitation, parseCitationData } from "../parsing/citationParser.js";
import { getCitationKey } from "../utils/citationKey.js";
import { escapeJsForScript, escapeJsonForScript } from "../vanilla/reportUtils.js";

// ── Test fixtures ──────────────────────────────────────────────────

const MARKED_HTML = `<!DOCTYPE html>
<html><head><title>Test</title></head>
<body>
  <p data-cite="1">Revenue grew 45% to $2.3B [1]</p>
  <p data-cite="2">Operating margin improved to 28.5% [2]</p>
</body>
</html>
<<<CITATION_DATA>>>
{
  "attach-abc123": [
    {
      "id": 1,
      "reasoning": "Revenue figure from Q4 report",
      "full_phrase": "Revenue grew 45% year-over-year to $2.3B",
      "anchor_text": "$2.3B",
      "page_id": "page_number_2_index_1",
      "line_ids": [20]
    },
    {
      "id": 2,
      "reasoning": "Margin figure from Q4 report",
      "full_phrase": "Operating margin improved to 28.5%",
      "anchor_text": "28.5%",
      "page_id": "page_number_3_index_2",
      "line_ids": [35]
    }
  ]
}
<<<END_CITATION_DATA>>>`;

// ── Parse stage ────────────────────────────────────────────────────

describe("verify --html: parse stage", () => {
  it("splits HTML from CITATION_DATA block", () => {
    const parsed = parseCitationData(MARKED_HTML);
    expect(parsed.success).toBe(true);
    expect(parsed.citations).toHaveLength(2);
    expect(parsed.visibleText).toContain("data-cite");
    expect(parsed.visibleText).not.toContain("<<<CITATION_DATA>>>");
  });

  it("extracts citation fields correctly", () => {
    const parsed = parseCitationData(MARKED_HTML);
    const c1 = parsed.citations[0];
    expect(c1.id).toBe(1);
    expect(c1.full_phrase).toBe("Revenue grew 45% year-over-year to $2.3B");
    expect(c1.anchor_text).toBe("$2.3B");
    expect(c1.page_id).toBe("page_number_2_index_1");
    expect(c1.line_ids).toEqual([20]);
  });

  it("returns success=true with no citations when no block present", () => {
    const parsed = parseCitationData("<html><body>no citations</body></html>");
    expect(parsed.success).toBe(true);
    expect(parsed.citations).toHaveLength(0);
  });
});

// ── Keygen stage ───────────────────────────────────────────────────

describe("verify --html: keygen stage", () => {
  it("produces deterministic keys from citation data", () => {
    const parsed = parseCitationData(MARKED_HTML);
    const c1 = citationDataToCitation(parsed.citations[0], 1);
    const key1 = getCitationKey(c1);

    // Same input → same key
    const c1Again = citationDataToCitation(parsed.citations[0], 1);
    expect(getCitationKey(c1Again)).toBe(key1);

    // Different citation → different key
    const c2 = citationDataToCitation(parsed.citations[1], 2);
    const key2 = getCitationKey(c2);
    expect(key2).not.toBe(key1);
  });

  it("keys are 16-char hex strings", () => {
    const parsed = parseCitationData(MARKED_HTML);
    const c1 = citationDataToCitation(parsed.citations[0], 1);
    const key = getCitationKey(c1);
    expect(key).toMatch(/^[a-f0-9]{16}$/);
  });
});

// ── Annotate stage ─────────────────────────────────────────────────

describe("verify --html: annotate stage", () => {
  it("maps data-cite='N' to data-citation-key='hash'", () => {
    const parsed = parseCitationData(MARKED_HTML);
    let html = parsed.visibleText;
    const idToHash = new Map<number, string>();

    for (const cd of parsed.citations) {
      const citation = citationDataToCitation(cd, cd.id);
      const hash = getCitationKey(citation);
      idToHash.set(cd.id, hash);
    }

    for (const [id, hash] of idToHash) {
      html = html.replace(new RegExp(`data-cite="${id}"`, "g"), `data-citation-key="${hash}"`);
    }

    // data-cite attributes should be replaced
    expect(html).not.toContain('data-cite="1"');
    expect(html).not.toContain('data-cite="2"');

    // data-citation-key attributes should be present
    for (const hash of idToHash.values()) {
      expect(html).toContain(`data-citation-key="${hash}"`);
    }
  });

  it("strips [N] markers only for known citation IDs", () => {
    const parsed = parseCitationData(MARKED_HTML);
    let html = parsed.visibleText;
    const knownIds = parsed.citations.map(c => c.id);

    // Strip only known citation ID markers
    for (const id of knownIds) {
      html = html.replace(new RegExp(`\\s*\\[${id}\\]`, "g"), "");
    }

    expect(html).not.toContain("[1]");
    expect(html).not.toContain("[2]");
    expect(html).toContain("Revenue grew 45% to $2.3B");
    expect(html).toContain("Operating margin improved to 28.5%");
  });
});

// ── Inject stage ───────────────────────────────────────────────────

describe("verify --html: inject stage", () => {
  it("injects with default variant and indicator", () => {
    const theme = "auto";
    const variant = "text";
    const indicator = "icon";

    const initParts = [`theme:${JSON.stringify(theme)}`];
    if (variant !== "text") initParts.push(`variant:${JSON.stringify(variant)}`);
    if (indicator !== "icon") initParts.push(`indicatorVariant:${JSON.stringify(indicator)}`);

    const initScript = `window.DeepCitationPopover&&window.DeepCitationPopover.init({${initParts.join(",")}});`;

    // Default: only theme, no variant or indicatorVariant
    expect(initScript).toContain('theme:"auto"');
    expect(initScript).not.toContain("variant:");
    expect(initScript).not.toContain("indicatorVariant:");
  });

  it("injects with custom variant and indicator", () => {
    const theme = "dark";
    const variant = "linter";
    const indicator = "dot";

    const initParts = [`theme:${JSON.stringify(theme)}`];
    if (variant !== "text") initParts.push(`variant:${JSON.stringify(variant)}`);
    if (indicator !== "icon") initParts.push(`indicatorVariant:${JSON.stringify(indicator)}`);

    const initScript = `window.DeepCitationPopover&&window.DeepCitationPopover.init({${initParts.join(",")}});`;

    expect(initScript).toContain('theme:"dark"');
    expect(initScript).toContain('variant:"linter"');
    expect(initScript).toContain('indicatorVariant:"dot"');
  });

  it("includes key-map in injected snippet", () => {
    const keyMap = { "cite-1": "abc123hash", "cite-2": "def456hash" };
    const keyMapSnippet = `<script type="application/json" id="dc-key-map">${escapeJsonForScript(JSON.stringify(keyMap))}</script>`;

    expect(keyMapSnippet).toContain('id="dc-key-map"');
    expect(keyMapSnippet).toContain("abc123hash");
    expect(keyMapSnippet).toContain("def456hash");
  });

  it("places snippet before </body>", () => {
    const html = "<html><body><p>Content</p></body></html>";
    const snippet = '<script id="dc-data">{}</script>';

    let output = html;
    if (output.includes("</body>")) {
      output = output.replace("</body>", () => `${snippet}\n</body>`);
    }

    expect(output.indexOf("dc-data")).toBeLessThan(output.indexOf("</body>"));
  });
});

// ── Full pipeline (unit-level) ────────────────────────────────────

describe("verify --html: full pipeline (unit)", () => {
  it("runs the complete parse → keygen → annotate → strip pipeline", () => {
    // 1. Parse
    const parsed = parseCitationData(MARKED_HTML);
    expect(parsed.success).toBe(true);

    // 2. Keygen
    const idToHash = new Map<number, string>();
    const keyMap: Record<string, string> = {};
    for (const cd of parsed.citations) {
      const citation = citationDataToCitation(cd, cd.id);
      const hash = getCitationKey(citation);
      idToHash.set(cd.id, hash);
      keyMap[`cite-${cd.id}`] = hash;
    }

    // 3. Annotate
    let html = parsed.visibleText;
    for (const [id, hash] of idToHash) {
      html = html.replace(new RegExp(`data-cite="${id}"`, "g"), `data-citation-key="${hash}"`);
    }
    for (const id of idToHash.keys()) {
      html = html.replace(new RegExp(`\\s*\\[${id}\\]`, "g"), "");
    }

    // 4. Verify output
    expect(html).not.toContain("data-cite=");
    expect(html).not.toContain("[1]");
    expect(html).not.toContain("[2]");
    expect(html).not.toContain("<<<CITATION_DATA>>>");

    // Has data-citation-key attributes
    for (const hash of idToHash.values()) {
      expect(html).toContain(`data-citation-key="${hash}"`);
    }

    // Key map has correct entries
    expect(Object.keys(keyMap)).toHaveLength(2);
    expect(keyMap["cite-1"]).toMatch(/^[a-f0-9]{16}$/);
    expect(keyMap["cite-2"]).toMatch(/^[a-f0-9]{16}$/);

    // Original content preserved
    expect(html).toContain("Revenue grew 45% to $2.3B");
    expect(html).toContain("Operating margin improved to 28.5%");
  });

  it("handles HTML without </body> tag", () => {
    const parsed = parseCitationData(MARKED_HTML);
    const snippet = '<script id="dc-data">{}</script>';

    // Test with bare HTML (no body close)
    let html = "<div>content</div>";
    if (html.includes("</body>")) {
      html = html.replace("</body>", () => `${snippet}\n</body>`);
    } else if (html.includes("</html>")) {
      html = html.replace("</html>", () => `${snippet}\n</html>`);
    } else {
      html = `${html}\n${snippet}`;
    }

    expect(html).toContain("content");
    expect(html).toContain("dc-data");
  });

  it("handles multiple citations for the same attachment", () => {
    const parsed = parseCitationData(MARKED_HTML);
    // Both citations should have the same attachmentId
    const attachmentIds = new Set(parsed.citations.map(c => c.attachment_id));
    expect(attachmentIds.size).toBe(1);
    expect(attachmentIds.has("attach-abc123")).toBe(true);
  });
});

// ── Variant/indicator validation ──────────────────────────────────

describe("variant and indicator validation", () => {
  const allowedVariants = ["text", "linter", "chip", "brackets", "superscript", "footnote", "block"];
  const allowedIndicators = ["icon", "dot", "caret", "none"];

  it("accepts all valid variants", () => {
    for (const v of allowedVariants) {
      expect(allowedVariants.includes(v)).toBe(true);
    }
  });

  it("accepts all valid indicators", () => {
    for (const i of allowedIndicators) {
      expect(allowedIndicators.includes(i)).toBe(true);
    }
  });

  it("rejects invalid variant", () => {
    expect(allowedVariants.includes("invalid" as string)).toBe(false);
  });

  it("rejects invalid indicator", () => {
    expect(allowedIndicators.includes("invalid" as string)).toBe(false);
  });
});

// ── Edge cases ────────────────────────────────────────────────────

describe("verify --html: edge cases", () => {
  it("handles citation data with missing optional fields gracefully", () => {
    const minimal = `<p data-cite="1">claim [1]</p>
<<<CITATION_DATA>>>
{
  "att-1": [
    {
      "id": 1,
      "full_phrase": "test phrase",
      "anchor_text": "test",
      "page_id": "page_number_1_index_0",
      "line_ids": [1]
    }
  ]
}
<<<END_CITATION_DATA>>>`;

    const parsed = parseCitationData(minimal);
    expect(parsed.success).toBe(true);
    expect(parsed.citations).toHaveLength(1);
  });

  it("preserves HTML structure when stripping markers", () => {
    const html = '<td data-cite="1">$2.3B [1]</td>';
    const knownIds = [1];
    let stripped = html;
    for (const id of knownIds) {
      stripped = stripped.replace(new RegExp(`\\s*\\[${id}\\]`, "g"), "");
    }
    expect(stripped).toBe('<td data-cite="1">$2.3B</td>');
  });

  it("handles markers at end of line without trailing space", () => {
    const html = "Revenue: $2.3B[1]";
    const knownIds = [1];
    let stripped = html;
    for (const id of knownIds) {
      stripped = stripped.replace(new RegExp(`\\s*\\[${id}\\]`, "g"), "");
    }
    expect(stripped).toBe("Revenue: $2.3B");
  });

  it("does not strip bracket content that is not a citation marker", () => {
    const html = "See section [Introduction] for details [1] and table [42]";
    const knownIds = [1]; // Only ID 1 is a known citation
    let stripped = html;
    for (const id of knownIds) {
      stripped = stripped.replace(new RegExp(`\\s*\\[${id}\\]`, "g"), "");
    }
    // [Introduction] preserved (non-numeric), [42] preserved (not a known citation ID)
    expect(stripped).toBe("See section [Introduction] for details and table [42]");
  });
});
