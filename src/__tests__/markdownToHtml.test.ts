import { describe, expect, it } from "@jest/globals";
import { AUDIENCE_PRESETS, markdownToHtml, wrapCitationMarkers } from "../cli/markdownToHtml.js";

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
    expect(result).toContain('class="meta"');
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
