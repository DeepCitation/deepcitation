import { afterEach, describe, expect, it, mock } from "@jest/globals";
import { cleanup, render } from "@testing-library/react";
import type React from "react";
import { CitationStatusIndicator } from "../react/CitationStatusIndicator";
import { CARET_INDICATOR_SIZE_STYLE, CARET_PILL_STYLE, INDICATOR_SIZE_STYLE } from "../react/constants";
import type { CitationStatus } from "../types/citation";

// Mock createPortal to render content in place instead of portal
mock.module("react-dom", () => ({
  createPortal: (node: React.ReactNode) => node,
}));

// =============================================================================
// TEST FIXTURES
// =============================================================================

const baseProps = {
  status: "found" as CitationStatus,
  indicatorVariant: "caret" as const,
  shouldShowSpinner: false,
  isVerified: true,
  isPartialMatch: false,
  isMiss: false,
  spinnerStage: "active" as const,
};

/** Helper: get the inner icon span (child of the pill wrapper). */
function getIconSpan(container: HTMLElement): HTMLElement {
  const pill = container.querySelector("[data-dc-indicator]") as HTMLElement;
  // Inner span is the direct child span that holds the SVG
  const inner = pill?.querySelector(":scope > span") as HTMLElement;
  return inner;
}

describe("Caret Indicator Variant", () => {
  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // PILL STRUCTURE
  // ==========================================================================

  it("renders pill wrapper with rounded-full and SVG inside inner span", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} />);
    const pill = container.querySelector("[data-dc-indicator='caret']") as HTMLElement;
    expect(pill).toBeInTheDocument();
    expect(pill.classList.contains("rounded-full")).toBe(true);
    // SVG is inside the inner icon span
    const inner = getIconSpan(container);
    expect(inner).toBeTruthy();
    expect(inner.querySelector("svg")).toBeInTheDocument();
  });

  // ==========================================================================
  // SIDE-AWARE ROTATION
  // ==========================================================================

  it("rotates 180deg when popoverSide=top and isOpen=true", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} isOpen={true} popoverSide="top" />);
    const inner = getIconSpan(container);
    expect(inner.style.transform).toBe("rotate(180deg)");
  });

  it("stays at 0deg when popoverSide=bottom and isOpen=true", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} isOpen={true} popoverSide="bottom" />);
    const inner = getIconSpan(container);
    expect(inner.style.transform).toBe("rotate(0deg)");
  });

  it("stays at 0deg when popoverSide is undefined and isOpen=true", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} isOpen={true} />);
    const inner = getIconSpan(container);
    expect(inner.style.transform).toBe("rotate(0deg)");
  });

  it("stays at 0deg when closed regardless of popoverSide", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} isOpen={false} popoverSide="top" />);
    const inner = getIconSpan(container);
    expect(inner.style.transform).toBe("rotate(0deg)");
  });

  // ==========================================================================
  // ACTIVE DARKENING
  // ==========================================================================

  it("uses darker gray (text-gray-600) when open", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} isOpen={true} popoverSide="bottom" />);
    const pill = container.querySelector("[data-dc-indicator='caret']") as HTMLElement;
    expect(pill.classList.contains("text-gray-600")).toBe(true);
  });

  it("uses lighter gray (text-gray-400) when closed", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} isOpen={false} />);
    const pill = container.querySelector("[data-dc-indicator='caret']") as HTMLElement;
    expect(pill.classList.contains("text-gray-400")).toBe(true);
  });

  // ==========================================================================
  // MISS → RED
  // ==========================================================================

  it("uses caret-error data attribute and red classes when miss", () => {
    const { container } = render(
      <CitationStatusIndicator {...baseProps} isVerified={false} isMiss={true} status={"not_found"} />,
    );
    const pill = container.querySelector("[data-dc-indicator='caret-error']") as HTMLElement;
    expect(pill).toBeInTheDocument();
    expect(pill.classList.contains("text-red-500")).toBe(true);
    expect(pill.classList.contains("bg-red-50")).toBe(true);
  });

  // ==========================================================================
  // VERIFIED/PARTIAL → GRAY (status-agnostic for non-miss)
  // ==========================================================================

  it("renders gray caret for verified status", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} isVerified={true} />);
    const pill = container.querySelector("[data-dc-indicator='caret']") as HTMLElement;
    expect(pill).toBeInTheDocument();
    expect(pill.classList.contains("text-gray-400")).toBe(true);
  });

  it("renders gray caret for partial status", () => {
    const { container } = render(
      <CitationStatusIndicator {...baseProps} isVerified={false} isPartialMatch={true} status={"partial"} />,
    );
    const pill = container.querySelector("[data-dc-indicator='caret']") as HTMLElement;
    expect(pill).toBeInTheDocument();
    expect(pill.classList.contains("text-gray-400")).toBe(true);
  });

  // ==========================================================================
  // SPINNER PRECEDENCE
  // ==========================================================================

  it("shows spinner instead of caret when shouldShowSpinner is true", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} shouldShowSpinner={true} />);
    const pending = container.querySelector("[data-dc-indicator='pending']");
    expect(pending).toBeInTheDocument();
    const caret = container.querySelector("[data-dc-indicator='caret']");
    expect(caret).not.toBeInTheDocument();
  });

  it("wraps spinner in pill with rounded-full", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} shouldShowSpinner={true} />);
    const pill = container.querySelector("[data-dc-indicator='pending']") as HTMLElement;
    expect(pill).toBeInTheDocument();
    expect(pill.classList.contains("rounded-full")).toBe(true);
  });

  // ==========================================================================
  // HIDDEN STATES
  // ==========================================================================

  it('returns null when indicatorVariant is "none"', () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} indicatorVariant="none" />);
    expect(container.innerHTML).toBe("");
  });

  // ==========================================================================
  // SIZE CONSTANT
  // ==========================================================================

  describe("CARET_INDICATOR_SIZE_STYLE", () => {
    it("is between dot and icon size", () => {
      expect(CARET_INDICATOR_SIZE_STYLE.width).toBe("0.7em");
      expect(CARET_INDICATOR_SIZE_STYLE.height).toBe("0.7em");
      expect(CARET_INDICATOR_SIZE_STYLE.minWidth).toBe("8px");
      expect(CARET_INDICATOR_SIZE_STYLE.minHeight).toBe("8px");

      // Confirm it sits between dot (0.4em) and icon (0.85em)
      expect(Number.parseFloat(CARET_INDICATOR_SIZE_STYLE.width as string)).toBeGreaterThan(0.4);
      expect(Number.parseFloat(CARET_INDICATOR_SIZE_STYLE.width as string)).toBeLessThan(0.85);
      expect(Number.parseFloat(INDICATOR_SIZE_STYLE.width as string)).toBe(0.85);
    });
  });

  describe("CARET_PILL_STYLE", () => {
    it("has correct padding", () => {
      expect(CARET_PILL_STYLE.padding).toBe("0.1em");
    });
  });
});
