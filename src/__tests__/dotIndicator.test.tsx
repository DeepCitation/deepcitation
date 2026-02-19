import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, render } from "@testing-library/react";
import type React from "react";
import { INDICATOR_SETS } from "../markdown/types";
import { CitationComponent } from "../react/CitationComponent";
import { getStatusInfo } from "../react/CitationDrawer.utils";
import { DOT_INDICATOR_SIZE_STYLE, INDICATOR_SIZE_STYLE } from "../react/constants";
import { StatusHeader } from "../react/VerificationLog";
import type { Citation } from "../types/citation";
import type { Verification } from "../types/verification";

// Mock createPortal to render content in place instead of portal
jest.mock("react-dom", () => ({
  ...jest.requireActual("react-dom"),
  createPortal: (node: React.ReactNode) => node,
}));

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseCitation: Citation = {
  type: "document",
  attachmentId: "test-123",
  pageNumber: 1,
  lineIds: [5],
  fullPhrase: "Revenue grew 45% in Q4.",
  anchorText: "grew 45%",
  citationNumber: 1,
};

const verifiedVerification: Verification = { status: "found" };
const partialVerification: Verification = { status: "found_on_other_page" };
const missVerification: Verification = { status: "not_found" };
const pendingVerification: Verification = { status: "pending" };

describe("Dot Indicator Variant", () => {
  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // CITATION COMPONENT
  // ==========================================================================

  describe("CitationComponent", () => {
    it("renders dot indicator for verified status", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verifiedVerification} indicatorVariant="dot" />,
      );
      // Dot indicators use rounded-full class (no SVG)
      const dots = container.querySelectorAll(".rounded-full");
      expect(dots.length).toBeGreaterThan(0);
    });

    it("renders dot indicator for partial match status", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={partialVerification} indicatorVariant="dot" />,
      );
      const dot = container.querySelector(".bg-amber-500");
      expect(dot).toBeInTheDocument();
    });

    it("renders dot indicator for miss status", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={missVerification} indicatorVariant="dot" />,
      );
      const dot = container.querySelector(".bg-red-500");
      expect(dot).toBeInTheDocument();
    });

    it("renders pulsing dot for pending status", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={pendingVerification} indicatorVariant="dot" />,
      );
      const dot = container.querySelector(".animate-pulse");
      expect(dot).toBeInTheDocument();
      expect(dot?.classList.contains("rounded-full")).toBe(true);
    });

    it("renders icon indicators by default (no indicatorVariant)", () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={verifiedVerification} />);
      // Default should render SVG checkmark icon
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renderIndicator overrides dot variant", () => {
      const customIndicator = (status: { isVerified: boolean }) =>
        status.isVerified ? <span data-testid="custom">Custom</span> : null;

      const { getByTestId } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          indicatorVariant="dot"
          renderIndicator={customIndicator}
        />,
      );
      expect(getByTestId("custom")).toBeInTheDocument();
    });

    it("showIndicator=false hides dot indicator", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          indicatorVariant="dot"
          showIndicator={false}
        />,
      );
      // No dot indicator should be present
      const greenDots = container.querySelectorAll(".bg-green-600.rounded-full");
      expect(greenDots.length).toBe(0);
    });

    it("dot indicator works with chip variant", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verifiedVerification}
          indicatorVariant="dot"
          variant="chip"
        />,
      );
      const dot = container.querySelector(".rounded-full.bg-green-600");
      expect(dot).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // STATUS HEADER (VerificationLog)
  // ==========================================================================

  describe("StatusHeader", () => {
    it("renders dot instead of icon when indicatorVariant is dot", () => {
      const { container } = render(<StatusHeader status="found" foundPage={5} indicatorVariant="dot" />);
      const dot = container.querySelector(".rounded-full");
      expect(dot).toBeInTheDocument();
    });

    it("renders icon by default", () => {
      const { container } = render(<StatusHeader status="found" foundPage={5} />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("renders pulsing dot for pending status with dot variant", () => {
      const { container } = render(<StatusHeader status="pending" indicatorVariant="dot" />);
      const dot = container.querySelector(".animate-pulse.rounded-full");
      expect(dot).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // GET STATUS INFO (Drawer utilities)
  // ==========================================================================

  describe("getStatusInfo", () => {
    it("returns correct label for verified with dot variant", () => {
      const result = getStatusInfo(verifiedVerification, "dot");
      expect(result.label).toBe("Verified");
      expect(result.color).toBe("text-green-500");
    });

    it("returns correct label for partial with dot variant", () => {
      const result = getStatusInfo(partialVerification, "dot");
      expect(result.label).toBe("Partial match");
      expect(result.color).toBe("text-amber-500");
    });

    it("returns correct label for miss with dot variant", () => {
      const result = getStatusInfo(missVerification, "dot");
      expect(result.label).toBe("Not found");
      expect(result.color).toBe("text-red-500");
    });

    it("returns correct label for pending with dot variant", () => {
      const result = getStatusInfo(pendingVerification, "dot");
      expect(result.label).toBe("Verifying");
      expect(result.color).toBe("text-gray-400");
    });

    it("defaults to icon variant when no variant specified", () => {
      const result = getStatusInfo(verifiedVerification);
      expect(result.label).toBe("Verified");
      expect(result.color).toBe("text-green-500");
    });
  });

  // ==========================================================================
  // CONSTANTS
  // ==========================================================================

  describe("DOT_INDICATOR_SIZE_STYLE", () => {
    it("is smaller than INDICATOR_SIZE_STYLE", () => {
      expect(DOT_INDICATOR_SIZE_STYLE.width).toBe("0.4em");
      expect(DOT_INDICATOR_SIZE_STYLE.height).toBe("0.4em");
      expect(DOT_INDICATOR_SIZE_STYLE.minWidth).toBe("6px");
      expect(DOT_INDICATOR_SIZE_STYLE.minHeight).toBe("6px");

      expect(INDICATOR_SIZE_STYLE.width).toBe("0.85em");
      expect(INDICATOR_SIZE_STYLE.height).toBe("0.85em");
    });
  });

  // ==========================================================================
  // MARKDOWN INDICATOR SETS
  // ==========================================================================

  describe("INDICATOR_SETS circle style (used for dot-like markdown output)", () => {
    it("has correct circle indicator characters", () => {
      expect(INDICATOR_SETS.circle).toEqual({
        verified: "●",
        partial: "◐",
        notFound: "○",
        pending: "◌",
      });
    });

    it("circle style exists as a valid IndicatorStyle key", () => {
      expect("circle" in INDICATOR_SETS).toBe(true);
    });
  });
});
