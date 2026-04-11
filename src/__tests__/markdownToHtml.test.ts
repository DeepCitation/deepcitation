import { describe, expect, it } from "@jest/globals";
import {
  AUDIENCE_PRESETS,
  buildCdnComparisonShowcaseHtml,
  markdownToHtml,
  wrapCitationMarkers,
} from "../cli/markdownToHtml.js";

// ── wrapCitationMarkers ───────────────────────────────────────────

describe("wrapCitationMarkers", () => {
  it("wraps text before a [N] marker in a data-cite span", () => {
    const html = "<p>Revenue grew 45% [1]</p>";
    const result = wrapCitationMarkers(html);
    expect(result).toContain('data-cite="1"');
    expect(result).not.toContain("[1]");
  });

  it("handles multiple markers across separate text runs", () => {
    const html = "<p>First claim [1]</p><p>Second claim [2]</p>";
    const result = wrapCitationMarkers(html);
    expect(result).toContain('data-cite="1"');
    expect(result).toContain('data-cite="2"');
  });

  it("handles multiple markers within the same paragraph", () => {
    const html = "<p>Revenue grew 45% [1] and margin improved [2]</p>";
    const result = wrapCitationMarkers(html);
    expect(result).toContain('data-cite="1"');
    expect(result).toContain('data-cite="2"');
  });

  it("produces an empty span when no text precedes the marker", () => {
    const html = "[1]";
    const result = wrapCitationMarkers(html);
    expect(result).toContain('data-cite="1"');
  });

  it("does not corrupt HTML attributes", () => {
    const html = '<a href="https://example.com">link text [3]</a>';
    const result = wrapCitationMarkers(html);
    expect(result).toContain('href="https://example.com"');
  });

  it("anchors to the last clause when text contains punctuation", () => {
    const html = "<p>Overall, revenue grew significantly [1]</p>";
    const result = wrapCitationMarkers(html);
    expect(result).toContain('data-cite="1"');
    expect(result).toContain("revenue grew significantly");
  });
  it("emits empty span for punctuation-only anchors", () => {
    // Schedule "C" produces an anchor of just `"` after the regex cuts at the quote
    const html = '<p>Schedule "C" [1]</p>';
    const result = wrapCitationMarkers(html);
    expect(result).toContain('data-cite="1"');
    // The span should have no inner text content (empty anchor)
    expect(result).toMatch(/<span data-cite="1"><\/span>/);
  });
});

// ── markdownToHtml — inline formatting ────────────────────────────

describe("markdownToHtml inline formatting", () => {
  it("converts bold text", () => {
    const result = markdownToHtml("**bold text**", { style: "plain" });
    expect(result).toContain("<strong>bold text</strong>");
  });

  it("converts italic text", () => {
    const result = markdownToHtml("*italic text*", { style: "plain" });
    expect(result).toContain("<em>italic text</em>");
  });

  it("converts bold+italic text", () => {
    const result = markdownToHtml("***bold italic***", { style: "plain" });
    expect(result).toContain("<strong><em>bold italic</em></strong>");
  });

  it("converts inline code", () => {
    const result = markdownToHtml("Use `console.log()`", { style: "plain" });
    expect(result).toContain("<code>console.log()</code>");
  });

  it("converts links with safe href", () => {
    const result = markdownToHtml("[Example](https://example.com)", { style: "plain" });
    expect(result).toContain('<a href="https://example.com">Example</a>');
  });

  it("does not double-encode & in URLs with query params", () => {
    const result = markdownToHtml("[Search](https://example.com/q?a=1&b=2)", { style: "plain" });
    // & must appear as &amp; exactly once — not &amp;amp;
    expect(result).toContain('href="https://example.com/q?a=1&amp;b=2"');
    expect(result).not.toContain("&amp;amp;");
  });

  it("blocks javascript: links", () => {
    const result = markdownToHtml("[xss](javascript:alert(1))", { style: "plain" });
    expect(result).toContain('href="#"');
    expect(result).not.toContain("javascript:");
  });

  it("escapes HTML entities in text", () => {
    const result = markdownToHtml("x < y & z > w", { style: "plain" });
    expect(result).toContain("x &lt; y &amp; z &gt; w");
  });
});

// ── markdownToHtml — block parsing ────────────────────────────────

describe("markdownToHtml block parsing", () => {
  it("renders headings", () => {
    const result = markdownToHtml("# Title\n\n## Section\n\n### Sub", { style: "plain" });
    expect(result).toContain("<h1>");
    expect(result).toContain("<h2>");
    expect(result).toContain("<h3>");
  });

  it("renders paragraphs", () => {
    const result = markdownToHtml("Hello world.\n\nSecond paragraph.", { style: "plain" });
    expect(result).toContain("<p>Hello world.</p>");
    expect(result).toContain("<p>Second paragraph.</p>");
  });

  it("renders unordered lists", () => {
    const result = markdownToHtml("- item one\n- item two\n- item three", { style: "plain" });
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>item one</li>");
    expect(result).toContain("<li>item two</li>");
  });

  it("renders ordered lists", () => {
    const result = markdownToHtml("1. first\n2. second", { style: "plain" });
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>first</li>");
  });

  it("renders code blocks with language class", () => {
    const result = markdownToHtml("```typescript\nconst x = 1;\n```", { style: "plain" });
    expect(result).toContain('<code class="language-typescript">');
    expect(result).toContain("const x = 1;");
  });

  it("escapes code block content", () => {
    const result = markdownToHtml("```\n<script>alert(1)</script>\n```", { style: "plain" });
    expect(result).toContain("&lt;script&gt;");
    expect(result).not.toContain("<script>alert");
  });

  it("escapes code fence language tag", () => {
    const result = markdownToHtml('```"><img onerror=alert(1)>\ncode\n```', { style: "plain" });
    // The language attribute value is HTML-escaped — no unescaped quote can break out
    expect(result).toContain("&quot;");
    expect(result).toMatch(/class="language-&quot;/);
  });

  it("renders tables", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
    const result = markdownToHtml(md, { style: "plain" });
    expect(result).toContain("<table>");
    expect(result).toContain("<th>");
    expect(result).toContain("Alice");
    expect(result).toContain("Bob");
  });

  it("renders horizontal rules", () => {
    const result = markdownToHtml("---", { style: "plain" });
    expect(result).toContain("<hr>");
  });

  it("passes through raw HTML", () => {
    const result = markdownToHtml('<div class="custom">content</div>', { style: "plain" });
    expect(result).toContain('<div class="custom">content</div>');
  });
});

// ── markdownToHtml — style shells ─────────────────────────────────

describe("markdownToHtml style shells", () => {
  const md = "# Report Title\n\nSome content here.";

  it("produces a full HTML document in plain mode", () => {
    const result = markdownToHtml(md, { style: "plain" });
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<title>Report Title</title>");
    expect(result).toContain("data-dc-drawer-trigger");
  });

  it("options.title overrides first H1 when both are present", () => {
    const result = markdownToHtml(md, { style: "plain", title: "Override Title" });
    expect(result).toContain("<title>Override Title</title>");
    expect(result).not.toContain("<title>Report Title</title>");
  });

  it("falls back to first H1 when options.title is not provided", () => {
    const result = markdownToHtml(md, { style: "plain" });
    expect(result).toContain("<title>Report Title</title>");
  });

  it("produces a report shell with progressive disclosure", () => {
    const mdWithSections = "# Report\n\n## Key Findings\n\nImportant stuff.\n\n## Details\n\nMore details.";
    const result = markdownToHtml(mdWithSections, { style: "report" });
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("dc-verdict");
    expect(result).toContain("data-dc-drawer-trigger");
  });

  it("uses system font stack (no external fonts)", () => {
    const result = markdownToHtml(md, { style: "report" });
    expect(result).toContain("-apple-system");
    expect(result).not.toContain("fonts.googleapis.com");
    expect(result).not.toContain("Inter");
  });

  it("uses custom title when provided", () => {
    const result = markdownToHtml("Some text.", { style: "plain", title: "Custom Title" });
    expect(result).toContain("<title>Custom Title</title>");
  });

  it("falls back to default title when no H1", () => {
    const result = markdownToHtml("Just a paragraph.", { style: "plain" });
    expect(result).toContain("<title>Verification Report</title>");
  });

  it("includes source label in report mode", () => {
    const result = markdownToHtml(md, { style: "report", sourceLabel: "Source: GPT-4" });
    expect(result).toContain("Source: GPT-4");
    expect(result).toContain('class="dc-meta"');
  });

  it("renders sourceUrl as a clickable link with scheme stripped", () => {
    const result = markdownToHtml(md, { style: "report", sourceUrl: "https://example.com/docs/report" });
    expect(result).toContain('href="https://example.com/docs/report"');
    expect(result).toContain("example.com/docs/report");
    expect(result).not.toContain("https://example.com/docs/report</span>"); // rendered as <a>, not plain text
  });

  it("falls back to sourceLabel when sourceUrl has an unsupported scheme", () => {
    const result = markdownToHtml(md, { style: "report", sourceUrl: "ftp://bad.com", sourceLabel: "Fallback Label" });
    expect(result).toContain("Fallback Label");
    expect(result).not.toContain("ftp://");
  });

  it("falls back to sourceLabel when sourceUrl is http (not https)", () => {
    const result = markdownToHtml(md, {
      style: "report",
      sourceUrl: "http://insecure.com/doc",
      sourceLabel: "Fallback",
    });
    expect(result).toContain("Fallback");
    expect(result).not.toContain('href="http://');
  });

  it("sourceUrl takes precedence over sourceLabel when https", () => {
    const result = markdownToHtml(md, {
      style: "report",
      sourceUrl: "https://example.com/doc",
      sourceLabel: "Should Not Appear",
    });
    expect(result).toContain('href="https://example.com/doc"');
    expect(result).not.toContain("Should Not Appear");
  });

  it("renders pageCount in the meta strip", () => {
    const result = markdownToHtml(md, { style: "report", pageCount: 42 });
    expect(result).toContain("PAGES");
    expect(result).toContain(">42<");
  });

  it("renders custom reportDate in the meta strip", () => {
    const result = markdownToHtml(md, { style: "report", reportDate: "1 Jan 2025" });
    expect(result).toContain("1 Jan 2025");
  });

  it("renders citationCount in the meta strip", () => {
    const result = markdownToHtml(md, { style: "report", citationCount: 12 });
    expect(result).toContain("CITATIONS");
    expect(result).toContain(">12<");
  });

  it("renders cowork notice banner when cowork is true", () => {
    const result = markdownToHtml(md, { style: "report", cowork: true });
    expect(result).toContain("dc-cowork-notice");
    expect(result).toContain("Cowork session");
  });

  it("does not render cowork notice div when cowork is false", () => {
    const result = markdownToHtml(md, { style: "report", cowork: false });
    expect(result).not.toContain('<div class="dc-cowork-notice">');
  });
});

describe("buildCdnComparisonShowcaseHtml", () => {
  it("builds a self-contained CDN demo with mock verifications", () => {
    const html = buildCdnComparisonShowcaseHtml();
    expect(html).toContain("data-dc-drawer-trigger");
    expect(html).toContain("demo-citation-1");
    expect(html).toContain("demo-citation-2");
    expect(html).toContain("demo-citation-3");
    expect(html).toContain("/src/vanilla/testing/demo-page.png");
    expect(html).toContain("window.DeepCitationPopover&&window.DeepCitationPopover.init");
  });
});

// ── markdownToHtml — audience presets ─────────────────────────────

describe("markdownToHtml audience presets", () => {
  it("exports all five audience presets", () => {
    expect(AUDIENCE_PRESETS).toEqual(["general", "executive", "technical", "legal", "medical"]);
  });

  it("uses narrower width for executive audience", () => {
    const md = "# Report\n\n## Section\n\nContent.";
    const executive = markdownToHtml(md, { style: "report", audience: "executive" });
    const general = markdownToHtml(md, { style: "report", audience: "general" });
    expect(executive).toContain("720px");
    expect(general).toContain("960px");
  });

  it("collapses details for executive audience", () => {
    const md = "# Report\n\n## Key Findings\n\nImportant.\n\n## Details\n\nMore.";
    const executive = markdownToHtml(md, { style: "report", audience: "executive" });
    // executive tier2Open is false, so no "open" attribute
    expect(executive).toContain("<details>");
    expect(executive).not.toContain("<details open>");
  });

  it("expands details for general audience", () => {
    const md = "# Report\n\n## Key Findings\n\nImportant.\n\n## Details\n\nMore.";
    const general = markdownToHtml(md, { style: "report", audience: "general" });
    expect(general).toContain("<details open>");
  });
});

// ── markdownToHtml — report body structure ────────────────────────

describe("markdownToHtml report body (progressive disclosure)", () => {
  it("places key findings before the disclosure fold", () => {
    const md =
      "# Report\n\n## Methodology\n\nHow we did it.\n\n## Key Findings\n\nThe results.\n\n## Appendix\n\nExtra.";
    const result = markdownToHtml(md, { style: "report" });
    const findingsPos = result.indexOf("The results.");
    const detailsPos = result.indexOf("<details");
    expect(findingsPos).toBeLessThan(detailsPos);
  });

  it("groups remaining sections under a single details element", () => {
    const md = "# Report\n\n## Key Findings\n\nResults.\n\n## A\n\nA.\n\n## B\n\nB.\n\n## C\n\nC.";
    const result = markdownToHtml(md, { style: "report" });
    expect(result).toContain("Full Report (3 sections)");
  });

  it("renders preamble content before sections", () => {
    const md = "# Report\n\nPreamble paragraph.\n\n## Section\n\nContent.";
    const result = markdownToHtml(md, { style: "report" });
    const preamblePos = result.indexOf("Preamble paragraph.");
    const sectionPos = result.indexOf("Content.");
    expect(preamblePos).toBeLessThan(sectionPos);
  });
});

// ── markdownToHtml — citation marker integration ──────────────────

describe("markdownToHtml citation markers", () => {
  it("wraps citation markers in the final output", () => {
    const md = "Revenue grew 45% [1]";
    const result = markdownToHtml(md, { style: "plain" });
    expect(result).toContain('data-cite="1"');
  });

  it("handles multiple citations in different blocks", () => {
    const md = "First claim [1]\n\nSecond claim [2]";
    const result = markdownToHtml(md, { style: "plain" });
    expect(result).toContain('data-cite="1"');
    expect(result).toContain('data-cite="2"');
  });
});

// ── markdownToHtml — cite: link format ──────────────────────────

describe("markdownToHtml — cite: link format", () => {
  it("converts [anchor](cite:N) to data-cite span", () => {
    const result = markdownToHtml("The [Discount Rate](cite:2) is applied.", { style: "plain" });
    expect(result).toContain('<span data-cite="2">Discount Rate</span>');
    // cite: links must NOT produce anchor elements (href="#" = fallback for unrecognized schemes)
    expect(result).not.toContain('href="#"');
    expect(result).not.toContain('href="cite:');
  });

  it("handles multiple cite: links in the same paragraph", () => {
    const result = markdownToHtml("The [Discount Rate](cite:2) is multiplied by the [Conversion Price](cite:3).", {
      style: "plain",
    });
    expect(result).toContain('<span data-cite="2">Discount Rate</span>');
    expect(result).toContain('<span data-cite="3">Conversion Price</span>');
  });

  it("works in a list item", () => {
    const result = markdownToHtml("- [Junior to](cite:9) payment of indebtedness", { style: "plain" });
    expect(result).toContain('<span data-cite="9">Junior to</span>');
  });

  it("preserves bold inside cite: anchor", () => {
    const result = markdownToHtml("[**bold anchor**](cite:1)", { style: "plain" });
    expect(result).toContain('data-cite="1"');
    expect(result).toContain("<strong>bold anchor</strong>");
  });

  it("does not break regular https links", () => {
    const result = markdownToHtml("[Docs](https://example.com)", { style: "plain" });
    expect(result).toContain('<a href="https://example.com">Docs</a>');
    expect(result).not.toContain("data-cite");
  });

  it("rejects cite: with non-numeric ID", () => {
    const result = markdownToHtml("[text](cite:evil)", { style: "plain" });
    expect(result).toContain('href="#"');
    expect(result).not.toContain("data-cite");
  });

  it("old [N] format still produces data-cite span in mixed document", () => {
    const result = markdownToHtml("Old [1] and [New Rate](cite:2)", { style: "plain" });
    expect(result).toContain('data-cite="1"');
    expect(result).toContain('data-cite="2"');
  });

  it("does not emit raw [anchor](cite:N) text", () => {
    const result = markdownToHtml("The [Discount Rate](cite:2) is applied.", { style: "plain" });
    expect(result).not.toContain("(cite:2)");
    expect(result).not.toContain("[Discount Rate](cite:2)");
  });
});

// ── markdownToHtml — **bold** [N] format (Strategy 2c) ────────────

describe("markdownToHtml — **bold** [N] format", () => {
  it("converts **bold** [N] to data-cite span with strong tag", () => {
    const result = markdownToHtml("The **Discount Rate** [1] is applied.", { style: "plain" });
    expect(result).toContain('<span data-cite="1"><strong>Discount Rate</strong></span>');
    expect(result).not.toContain("[1]");
  });

  it("handles multiple **bold** [N] markers in the same paragraph", () => {
    const result = markdownToHtml("**Revenue** [1] grew while **costs** [2] fell.", { style: "plain" });
    expect(result).toContain('<span data-cite="1"><strong>Revenue</strong></span>');
    expect(result).toContain('<span data-cite="2"><strong>costs</strong></span>');
  });

  it("coexists with regular bold that has no [N] marker", () => {
    const result = markdownToHtml("**Revenue** [1] grew. This is **important** context.", { style: "plain" });
    expect(result).toContain('<span data-cite="1"><strong>Revenue</strong></span>');
    expect(result).toContain("<strong>important</strong>");
    expect(result).not.toContain('data-cite="2"');
  });

  it("works in list items", () => {
    const result = markdownToHtml("- **First Amendment** [1] protects freedoms", { style: "plain" });
    expect(result).toContain('<span data-cite="1"><strong>First Amendment</strong></span>');
  });

  it("strong tag is INSIDE data-cite span, not a sibling", () => {
    // Regression: published 0.3.10 generated <strong>text</strong><span data-cite="1"></span>
    // (siblings), making only the icon clickable, not the bold text.
    const result = markdownToHtml("The **initial closing** [1] of an event.", { style: "plain" });
    // Correct: <span data-cite="1"><strong>initial closing</strong></span>
    expect(result).toContain('<span data-cite="1"><strong>initial closing</strong></span>');
    // Wrong: <strong>initial closing</strong><span data-cite="1"></span>
    expect(result).not.toMatch(/<strong>initial closing<\/strong>\s*<span data-cite="1">/);
  });

  it("strong tag remains inside span when sourceMatchMap is used", () => {
    const sourceMatchMap = { "1": "initial closing", "2": "automatically convert" };
    const result = markdownToHtml("On **initial closing** [1] of an event, the SAFE **automatically convert** [2]s.", {
      style: "plain",
      sourceMatchMap,
    });
    // Both strong tags must be children of their data-cite spans
    expect(result).toContain('<span data-cite="1"><strong>initial closing</strong></span>');
    expect(result).toContain('<span data-cite="2"><strong>automatically convert</strong></span>');
  });
});

// ── §7 false-positive structure regression tests ──────────────────
//
// These tests document the exact HTML structures that trigger false PLACEMENT
// flags in the review-verify extraction script (review_extract.py).  They are
// structural regression tests: if markdownToHtml ever changes the HTML shape
// for these patterns, review_extract.py must be updated to match.
//
// Pattern 3 (list-item): span is sole <li> content → pre_text strips to "".
// Pattern 4 (bold-text): span inner is <strong>label</strong> → display has HTML tags.

describe("markdownToHtml — §7 extraction-script structure regressions", () => {
  it("[§7 pattern 3] list-item citation produces span as sole <li> content", () => {
    // "- transferable [1]" → heuristic wraps "transferable" → <li><span>transferable</span></li>
    // Extractor pre_text after tag-strip = "" → empty-pre guard must suppress PLACEMENT flag.
    const result = markdownToHtml("- transferable [1]", { style: "plain" });
    expect(result).toMatch(/<li><span data-cite="1">transferable<\/span><\/li>/);
  });

  it("[§7 pattern 4] bold citation span inner is <strong>label</strong>, not plain text", () => {
    // "**interest rate** [1]" → Strategy 2c → <span data-cite="1"><strong>interest rate</strong></span>
    // Extractor must strip HTML from inner before placement check, else "<strong>interest rate</strong>"
    // is searched in plain-text prose and never matches.
    const result = markdownToHtml("The **interest rate** [1] applies.", { style: "plain" });
    expect(result).toContain('<span data-cite="1"><strong>interest rate</strong></span>');
    // Confirm the <strong> is INSIDE the span (not a sibling) — that's what gives inner its HTML tags.
    expect(result).not.toMatch(/<strong>interest rate<\/strong>\s*<span data-cite="1">/);
  });
});
