import { afterEach, describe, expect, it, mock } from "@jest/globals";
import { cleanup, render } from "@testing-library/react";
import type React from "react";
import { CARET_INDICATOR_SIZE_STYLE, INDICATOR_SIZE_STYLE } from "../react/constants";
import { CitationStatusIndicator } from "../react/CitationStatusIndicator";
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
  showIndicator: true,
  indicatorVariant: "caret" as const,
  shouldShowSpinner: false,
  isVerified: true,
  isPartialMatch: false,
  isMiss: false,
  spinnerStage: "active" as const,
};

describe("Caret Indicator Variant", () => {
  afterEach(() => {
    cleanup();
  });

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  it("renders chevron-down SVG for caret variant", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    const indicator = container.querySelector("[data-dc-indicator='caret']");
    expect(indicator).toBeInTheDocument();
  });

  it("applies rotate(0deg) when isOpen is false", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} isOpen={false} />);
    const indicator = container.querySelector("[data-dc-indicator='caret']") as HTMLElement;
    expect(indicator).toBeInTheDocument();
    expect(indicator.style.transform).toBe("rotate(0deg)");
  });

  it("applies rotate(180deg) when isOpen is true", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} isOpen={true} />);
    const indicator = container.querySelector("[data-dc-indicator='caret']") as HTMLElement;
    expect(indicator).toBeInTheDocument();
    expect(indicator.style.transform).toBe("rotate(180deg)");
  });

  it("defaults to rotate(0deg) when isOpen is undefined", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} />);
    const indicator = container.querySelector("[data-dc-indicator='caret']") as HTMLElement;
    expect(indicator).toBeInTheDocument();
    expect(indicator.style.transform).toBe("rotate(0deg)");
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

  // ==========================================================================
  // STATUS AGNOSTIC
  // ==========================================================================

  it("renders neutral gray caret regardless of verification status", () => {
    // Verified
    const { container: v } = render(<CitationStatusIndicator {...baseProps} isVerified={true} />);
    const caretV = v.querySelector("[data-dc-indicator='caret']");
    expect(caretV).toBeInTheDocument();
    expect(caretV?.classList.contains("text-gray-400")).toBe(true);
    cleanup();

    // Miss
    const { container: m } = render(
      <CitationStatusIndicator {...baseProps} isVerified={false} isMiss={true} status={"not_found"} />,
    );
    const caretM = m.querySelector("[data-dc-indicator='caret']");
    expect(caretM).toBeInTheDocument();
    expect(caretM?.classList.contains("text-gray-400")).toBe(true);
    cleanup();

    // Partial
    const { container: p } = render(
      <CitationStatusIndicator {...baseProps} isVerified={false} isPartialMatch={true} status={"partial"} />,
    );
    const caretP = p.querySelector("[data-dc-indicator='caret']");
    expect(caretP).toBeInTheDocument();
    expect(caretP?.classList.contains("text-gray-400")).toBe(true);
  });

  // ==========================================================================
  // HIDDEN STATES
  // ==========================================================================

  it("returns null when showIndicator is false", () => {
    const { container } = render(<CitationStatusIndicator {...baseProps} showIndicator={false} />);
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
});
