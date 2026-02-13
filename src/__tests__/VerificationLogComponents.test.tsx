import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  type AmbiguityInfo,
  AmbiguityWarning,
  FaviconImage,
  LookingForSection,
  SourceContextHeader,
} from "../react/VerificationLog";
import { getVariationLabel } from "../react/variationLabels";
import type { Citation } from "../types/citation";
import type { Verification } from "../types/verification";

describe("AmbiguityWarning", () => {
  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // RENDERING TESTS
  // ==========================================================================

  describe("rendering", () => {
    it("renders when totalOccurrences > 1", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 3,
        occurrencesOnExpectedPage: 1,
        confidence: "medium",
        note: "Multiple matches found",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      expect(container.textContent).toContain("Found 3 occurrences");
    });

    it("does not render when totalOccurrences is 1", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 1,
        occurrencesOnExpectedPage: 1,
        confidence: "high",
        note: "",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      expect(container.textContent).toBe("");
    });

    it("does not render when totalOccurrences is 0", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 0,
        occurrencesOnExpectedPage: 0,
        confidence: "low",
        note: "",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      expect(container.textContent).toBe("");
    });

    it("displays occurrences on expected page when > 0", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 5,
        occurrencesOnExpectedPage: 2,
        confidence: "medium",
        note: "",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      expect(container.textContent).toContain("(2 on expected page)");
    });

    it("does not show expected page count when 0", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 3,
        occurrencesOnExpectedPage: 0,
        confidence: "low",
        note: "",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      expect(container.textContent).not.toContain("on expected page");
    });

    it("displays note when present", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 2,
        occurrencesOnExpectedPage: 1,
        confidence: "medium",
        note: "This is a test note about ambiguity",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      expect(container.textContent).toContain("This is a test note about ambiguity");
    });

    it("truncates very long notes at word boundary", () => {
      // Create a note with words that exceeds 200 chars
      const longNote = "This is a test note that goes on and on. ".repeat(10); // ~410 chars
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 2,
        occurrencesOnExpectedPage: 1,
        confidence: "low",
        note: longNote,
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      // Should be truncated and end with "..."
      expect(container.textContent).toContain("...");
      // Should not contain the full note
      expect(container.textContent).not.toContain(longNote);
      // Should end at a word boundary followed by "..." (space before ...)
      // The truncated text should end with a complete word
      const noteText = container.textContent || "";
      const ellipsisIndex = noteText.lastIndexOf("...");
      expect(ellipsisIndex).toBeGreaterThan(0);
      // Character before "..." should be a word character (end of complete word)
      const charBeforeEllipsis = noteText[ellipsisIndex - 1];
      expect(charBeforeEllipsis).toMatch(/\w/);
    });

    it("truncates at 200 chars when no word boundary found after 150 chars", () => {
      // Create a note with no spaces (worst case)
      const longNote = "A".repeat(250);
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 2,
        occurrencesOnExpectedPage: 1,
        confidence: "low",
        note: longNote,
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      // Should be truncated to 200 chars + "..." when no word boundary
      expect(container.textContent).toContain(`${"A".repeat(200)}...`);
      expect(container.textContent).not.toContain("A".repeat(201));
    });

    it("handles large occurrence numbers with locale formatting", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 10000,
        occurrencesOnExpectedPage: 5000,
        confidence: "low",
        note: "",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      // Should use locale formatting (10,000 in en-US)
      expect(container.textContent).toContain("10,000");
      expect(container.textContent).toContain("5,000");
    });
  });

  // ==========================================================================
  // ACCESSIBILITY TESTS
  // ==========================================================================

  describe("accessibility", () => {
    it("has role='status' for screen readers", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 2,
        occurrencesOnExpectedPage: 1,
        confidence: "medium",
        note: "",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      const statusElement = container.querySelector("[role='status']");
      expect(statusElement).toBeInTheDocument();
    });

    it("has aria-live='polite' for dynamic updates", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 2,
        occurrencesOnExpectedPage: 1,
        confidence: "medium",
        note: "",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      const statusElement = container.querySelector("[aria-live='polite']");
      expect(statusElement).toBeInTheDocument();
    });

    it("has accessible warning icon", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 2,
        occurrencesOnExpectedPage: 1,
        confidence: "medium",
        note: "",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      const svgElement = container.querySelector("svg[role='img']");
      expect(svgElement).toBeInTheDocument();
      expect(svgElement?.getAttribute("aria-label")).toBe("Warning");
    });
  });

  // ==========================================================================
  // STYLING TESTS
  // ==========================================================================

  describe("styling", () => {
    it("uses amber background styling", () => {
      const ambiguity: AmbiguityInfo = {
        totalOccurrences: 2,
        occurrencesOnExpectedPage: 1,
        confidence: "medium",
        note: "",
      };

      const { container } = render(<AmbiguityWarning ambiguity={ambiguity} />);
      const warningDiv = container.querySelector(".bg-amber-50");
      expect(warningDiv).toBeInTheDocument();
    });
  });
});

describe("LookingForSection", () => {
  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // RENDERING TESTS
  // ==========================================================================

  describe("rendering", () => {
    it("renders with anchorText only", () => {
      const { container } = render(<LookingForSection anchorText="test anchor" />);
      expect(container.textContent).toContain("Looking for");
      expect(container.textContent).toContain("test anchor");
    });

    it("renders with fullPhrase only", () => {
      const { container } = render(<LookingForSection fullPhrase="test full phrase" />);
      expect(container.textContent).toContain("Looking for");
      expect(container.textContent).toContain("test full phrase");
    });

    it("renders with both anchorText and fullPhrase", () => {
      const { container } = render(
        <LookingForSection anchorText="anchor text" fullPhrase="The anchor text is important." />,
      );
      expect(container.textContent).toContain("Looking for");
      expect(container.textContent).toContain("anchor text");
      expect(container.textContent).toContain("The anchor text is important.");
    });

    it("does not render when both are empty", () => {
      const { container } = render(<LookingForSection />);
      expect(container.textContent).toBe("");
    });

    it("does not render when anchorText is empty string", () => {
      const { container } = render(<LookingForSection anchorText="" />);
      expect(container.textContent).toBe("");
    });

    it("does not render when anchorText is only whitespace", () => {
      const { container } = render(<LookingForSection anchorText="   " />);
      expect(container.textContent).toBe("");
    });

    it("handles anchorText === fullPhrase (shows only once)", () => {
      const { container } = render(<LookingForSection anchorText="same text" fullPhrase="same text" />);
      expect(container.textContent).toContain("Looking for");
      expect(container.textContent).toContain("same text");
      // Should only appear once in the rendered output (in quotes)
      const matches = container.textContent?.match(/same text/g);
      expect(matches?.length).toBe(1);
    });
  });
});

describe("getVariationLabel", () => {
  // ==========================================================================
  // VARIATION TYPE LABELS
  // ==========================================================================

  describe("known variation types", () => {
    it("returns 'Exact match' for exact", () => {
      expect(getVariationLabel("exact")).toBe("Exact match");
    });

    it("returns 'Normalized' for normalized", () => {
      expect(getVariationLabel("normalized")).toBe("Normalized");
    });

    it("returns 'Price formats' for currency", () => {
      expect(getVariationLabel("currency")).toBe("Price formats");
    });

    it("returns 'Date formats' for date", () => {
      expect(getVariationLabel("date")).toBe("Date formats");
    });

    it("returns 'Number formats' for numeric", () => {
      expect(getVariationLabel("numeric")).toBe("Number formats");
    });

    it("returns 'Symbol variants' for symbol", () => {
      expect(getVariationLabel("symbol")).toBe("Symbol variants");
    });

    it("returns 'Accent variants' for accent", () => {
      expect(getVariationLabel("accent")).toBe("Accent variants");
    });
  });

  describe("undefined handling", () => {
    it("returns null for undefined", () => {
      expect(getVariationLabel(undefined)).toBe(null);
    });
  });
});

// =============================================================================
// SOURCE CONTEXT HEADER TESTS
// =============================================================================

describe("SourceContextHeader", () => {
  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // URL CITATION TESTS
  // ==========================================================================

  describe("URL citations", () => {
    it("renders favicon and domain for URL citation", () => {
      const citation: Citation = {
        type: "url",
        url: "https://example.com/article",
        domain: "example.com",
        fullPhrase: "Test phrase",
      };

      const { container } = render(<SourceContextHeader citation={citation} />);

      // Should show the domain
      expect(container.textContent).toContain("example.com");
      // Should have an img element for favicon (uses Google Favicon fallback)
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
    });

    it("shows domain from URL in UrlCitationComponent", () => {
      const citation: Citation = {
        type: "url",
        url: "https://example.com/article",
        domain: "example.com",
        siteName: "Example Site",
        fullPhrase: "Test phrase",
      };

      const { container } = render(<SourceContextHeader citation={citation} />);

      // UrlCitationComponent shows domain/path format
      expect(container.textContent).toContain("example.com");
    });

    it("shows domain and path from URL", () => {
      const citation: Citation = {
        type: "url",
        url: "https://example.com/article",
        domain: "example.com",
        title: "Article Title",
        fullPhrase: "Test phrase",
      };

      const { container } = render(<SourceContextHeader citation={citation} />);

      // UrlCitationComponent shows domain/path
      expect(container.textContent).toContain("example.com");
    });

    it("uses verified domain from verification over citation", () => {
      const citation: Citation = {
        type: "url",
        url: "https://example.com/article",
        domain: "example.com",
        siteName: "Original Site",
        fullPhrase: "Test phrase",
      };
      const verification: Verification = {
        url: {
          verifiedSiteName: "Verified Site Name",
          verifiedDomain: "verified.com",
        },
      };

      const { container } = render(<SourceContextHeader citation={citation} verification={verification} />);

      // UrlCitationComponent uses verified domain
      expect(container.textContent).toContain("verified.com");
    });

    it("shows domain with truncated path for long URLs", () => {
      const citation: Citation = {
        type: "url",
        url: "https://example.com/very/long/path/to/article",
        domain: "example.com",
        fullPhrase: "Test phrase",
      };

      const { container } = render(<SourceContextHeader citation={citation} />);

      // Should show domain (UrlCitationComponent truncates path)
      expect(container.textContent).toContain("example.com");
    });
  });

  // ==========================================================================
  // DOCUMENT CITATION TESTS
  // ==========================================================================

  describe("Document citations", () => {
    it("renders document icon and label for document citation", () => {
      const citation: Citation = {
        type: "document",
        attachmentId: "abc123def456",
        pageNumber: 5,
        fullPhrase: "Test phrase",
      };
      const verification: Verification = {
        label: "Invoice.pdf",
        document: {
          verifiedPageNumber: 5,
        },
      };

      const { container } = render(<SourceContextHeader citation={citation} verification={verification} />);

      expect(container.textContent).toContain("Invoice.pdf");
      // Page info is now shown as "p.X" format
      expect(container.textContent).toContain("p.5");
      // Should have SVG for document icon
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("does not show attachmentId when no label provided", () => {
      const citation: Citation = {
        type: "document",
        attachmentId: "abc123def456ghij7890",
        pageNumber: 1,
        fullPhrase: "Test phrase",
      };

      const { container } = render(<SourceContextHeader citation={citation} />);

      // attachmentId should never be shown to users - only show page info
      expect(container.textContent).not.toContain("abc123");
      expect(container.textContent).toContain("p.1");
    });

    it("returns null when no meaningful display info available", () => {
      const citation: Citation = {
        type: "document",
        fullPhrase: "Test phrase",
      };

      const { container } = render(<SourceContextHeader citation={citation} />);

      expect(container.textContent).toBe("");
    });

    it("shows page number even without label or attachmentId", () => {
      const citation: Citation = {
        type: "document",
        pageNumber: 10,
        fullPhrase: "Test phrase",
      };

      const { container } = render(<SourceContextHeader citation={citation} />);

      // Page info is now shown as "p.X" format
      expect(container.textContent).toContain("p.10");
    });
  });
});

// =============================================================================
// FAVICON IMAGE TESTS
// =============================================================================

describe("FaviconImage", () => {
  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // RENDERING TESTS
  // ==========================================================================

  describe("rendering", () => {
    it("renders img when faviconUrl is provided", () => {
      const { container } = render(
        <FaviconImage faviconUrl="https://example.com/favicon.ico" domain="example.com" alt="Example" />,
      );

      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
      expect(img?.getAttribute("src")).toBe("https://example.com/favicon.ico");
    });

    it("uses Google Favicon Service when only domain is provided", () => {
      const { container } = render(<FaviconImage faviconUrl={null} domain="example.com" alt="Example" />);

      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();
      expect(img?.getAttribute("src")).toContain("google.com/s2/favicons");
      expect(img?.getAttribute("src")).toContain("domain=example.com");
    });

    it("renders GlobeIcon when no faviconUrl or domain provided", () => {
      const { container } = render(<FaviconImage faviconUrl={null} domain={null} alt="Source" />);

      // Should not have an img element
      const img = container.querySelector("img");
      expect(img).not.toBeInTheDocument();
      // Should have SVG for globe icon
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("falls back to GlobeIcon when image fails to load", async () => {
      const { container } = render(
        <FaviconImage faviconUrl="https://invalid-url.com/broken.ico" domain="example.com" alt="Example" />,
      );

      // Initially should show img
      const img = container.querySelector("img");
      expect(img).toBeInTheDocument();

      // Trigger error event
      if (img) {
        fireEvent.error(img);
      }

      // After error, should show GlobeIcon (SVG)
      await waitFor(() => {
        const svg = container.querySelector("svg");
        expect(svg).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // ACCESSIBILITY TESTS
  // ==========================================================================

  describe("accessibility", () => {
    it("uses provided alt text", () => {
      const { container } = render(
        <FaviconImage faviconUrl="https://example.com/favicon.ico" domain="example.com" alt="Example Site" />,
      );

      const img = container.querySelector("img");
      expect(img?.getAttribute("alt")).toBe("Example Site");
    });

    it("falls back to 'Source' for empty alt text", () => {
      const { container } = render(
        <FaviconImage faviconUrl="https://example.com/favicon.ico" domain="example.com" alt="" />,
      );

      const img = container.querySelector("img");
      expect(img?.getAttribute("alt")).toBe("Source");
    });

    it("falls back to 'Source' for whitespace-only alt text", () => {
      const { container } = render(
        <FaviconImage faviconUrl="https://example.com/favicon.ico" domain="example.com" alt="   " />,
      );

      const img = container.querySelector("img");
      expect(img?.getAttribute("alt")).toBe("Source");
    });
  });
});
