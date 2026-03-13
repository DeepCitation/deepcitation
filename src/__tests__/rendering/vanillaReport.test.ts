import { describe, expect, it } from "@jest/globals";
import { CITATION_DATA_END_DELIMITER, CITATION_DATA_START_DELIMITER } from "../../prompts/citationPrompts.js";
import type { Verification } from "../../types/verification.js";
import { getCitationKey } from "../../utils/citationKey.js";
import { renderCitationReport } from "../../vanilla/renderReport.js";

// =============================================================================
// TEST HELPERS
// =============================================================================

function makeNumericResponse(visibleText: string, citations: unknown[]): string {
  return `${visibleText}\n\n${CITATION_DATA_START_DELIMITER}\n${JSON.stringify(citations)}\n${CITATION_DATA_END_DELIMITER}`;
}

// =============================================================================
// TEST FIXTURES
// =============================================================================

const simpleInput = makeNumericResponse("Revenue grew 45% [1] according to reports.", [
  {
    id: 1,
    attachment_id: "abc123",
    page_id: "3_0",
    full_phrase: "Revenue grew 45% in Q4.",
    anchor_text: "grew 45%",
    line_ids: [12, 13],
  },
]);

const verifiedVerification: Verification = {
  status: "found",
  document: { verifiedPageNumber: 3 },
  label: "Q4 Report",
};

const citationKey = getCitationKey({
  attachmentId: "abc123",
  pageNumber: 3,
  fullPhrase: "Revenue grew 45% in Q4.",
  anchorText: "grew 45%",
  lineIds: [12, 13],
});

// =============================================================================
// TESTS
// =============================================================================

describe("renderCitationReport", () => {
  describe("full page output", () => {
    it("produces a complete HTML document by default", () => {
      const html = renderCitationReport(simpleInput);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('<html lang="en"');
      expect(html).toContain("<title>Citation Report</title>");
      expect(html).toContain("</html>");
    });

    it("uses custom title", () => {
      const html = renderCitationReport(simpleInput, { title: "My Report" });
      expect(html).toContain("<title>My Report</title>");
    });

    it("sets data-dc-theme attribute", () => {
      const html = renderCitationReport(simpleInput, { theme: "dark" });
      expect(html).toContain('data-dc-theme="dark"');
    });

    it("defaults to auto theme", () => {
      const html = renderCitationReport(simpleInput);
      expect(html).toContain('data-dc-theme="auto"');
    });
  });

  describe("fullPage=false", () => {
    it("returns fragment without DOCTYPE or html wrapper", () => {
      const html = renderCitationReport(simpleInput, { fullPage: false });
      expect(html).not.toContain("<!DOCTYPE");
      expect(html).not.toContain("<html");
      expect(html).toContain("dc-report");
    });
  });

  describe("styles", () => {
    it("includes style block by default", () => {
      const html = renderCitationReport(simpleInput);
      expect(html).toContain("<style>");
      expect(html).toContain("dc-popover");
    });

    it("omits styles when includeStyles is false", () => {
      const html = renderCitationReport(simpleInput, { includeStyles: false });
      expect(html).not.toContain("<style>");
    });
  });

  describe("runtime", () => {
    it("embeds verification JSON data block", () => {
      const html = renderCitationReport(simpleInput, {
        verifications: { [citationKey]: verifiedVerification },
      });
      expect(html).toContain('<script type="application/json" id="dc-data">');
      expect(html).toContain("Q4 Report");
    });

    it("embeds runtime IIFE script", () => {
      const html = renderCitationReport(simpleInput);
      expect(html).toMatch(/<script>\(.*\)\(\);<\/script>/s);
    });

    it("omits runtime when includeRuntime is false", () => {
      const html = renderCitationReport(simpleInput, { includeRuntime: false });
      expect(html).not.toContain("dc-data");
      expect(html).not.toContain("<script>");
    });
  });

  describe("citation rendering", () => {
    it("renders citation triggers with data-citation-key", () => {
      const html = renderCitationReport(simpleInput);
      expect(html).toContain("data-citation-key=");
    });

    it("renders verified status when verifications provided", () => {
      const html = renderCitationReport(simpleInput, {
        verifications: { [citationKey]: verifiedVerification },
      });
      expect(html).toContain("dc-verified");
    });

    it("does not include tooltip elements (popovers replace them)", () => {
      const html = renderCitationReport(simpleInput);
      // Tooltip CSS rules exist in the style block, but no tooltip spans are rendered
      expect(html).not.toContain('class="dc-tooltip"');
    });

    it("renders linter variant", () => {
      const html = renderCitationReport(simpleInput, { variant: "linter" });
      expect(html).toContain("dc-linter");
    });
  });

  describe("escapeJsonForScript (security)", () => {
    function extractJsonBlock(html: string): string {
      const match = html.match(/<script type="application\/json" id="dc-data">(.*?)<\/script>/s);
      expect(match).not.toBeNull();
      return match?.[1] ?? "";
    }

    it("escapes </script> in verification values", () => {
      const malicious: Verification = {
        status: "found",
        label: '</script><script>alert("xss")</script>',
      };
      const html = renderCitationReport(simpleInput, {
        verifications: { [citationKey]: malicious },
      });
      const json = extractJsonBlock(html);
      expect(json).not.toContain("</script>");
      expect(json).toContain("\\u003c/script\\u003e");
    });

    it("escapes angle brackets in all JSON values", () => {
      const withAngles: Verification = {
        status: "found",
        label: "<img onerror=alert(1)>",
      };
      const html = renderCitationReport(simpleInput, {
        verifications: { [citationKey]: withAngles },
      });
      const json = extractJsonBlock(html);
      expect(json).not.toContain("<img");
    });
  });

  describe("title escaping", () => {
    it("escapes HTML in title", () => {
      const html = renderCitationReport(simpleInput, {
        title: '<script>alert("xss")</script>',
      });
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
    });
  });
});
