import { afterEach, describe, expect, it, jest, mock } from "@jest/globals";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import React from "react";
import { CitationComponent } from "../react/CitationComponent";
import type { Citation } from "../types/citation";
import type { Verification } from "../types/verification";
import type {
  CitationBehaviorActions,
  CitationBehaviorContext,
} from "../react/types";

// Mock createPortal to render content in place instead of portal
// This allows us to query overlay elements in the same container
mock.module("react-dom", () => ({
  createPortal: (node: React.ReactNode) => node,
}));

// Hover close delay must match HOVER_CLOSE_DELAY_MS in CitationComponent
const HOVER_CLOSE_DELAY_MS = 150;

// Helper to wait for hover close delay
const waitForHoverCloseDelay = () =>
  new Promise((resolve) => setTimeout(resolve, HOVER_CLOSE_DELAY_MS + 50));

describe("CitationComponent behaviorConfig", () => {
  afterEach(() => {
    cleanup();
  });

  // Test fixtures
  const baseCitation: Citation = {
    citationNumber: 1,
    anchorText: "test citation",
    fullPhrase: "This is a test citation phrase",
  };

  const verificationWithImage: Verification = {
    verificationImageBase64: "data:image/png;base64,iVBORw0KGgo=",
    matchSnippet: "test citation phrase",
    pageNumber: 1,
    status: "found",
  };

  const verificationWithoutImage: Verification = {
    matchSnippet: "test citation phrase",
    pageNumber: 1,
    status: "found",
  };

  const missVerification: Verification = {
    matchSnippet: "",
    pageNumber: 0,
    status: "not_found",
  };

  const pendingVerification: Verification = {
    status: "pending",
  };

  // ==========================================================================
  // STATUS DERIVATION TESTS
  // Status is derived from verification.status
  // ==========================================================================

  describe("status derivation from verification", () => {
    it("shows spinner for pending status", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={pendingVerification}
        />
      );

      // Should have a spinner (svg with animate-spin class)
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).toBeInTheDocument();
    });

    it("does not show spinner when verification is null (use isLoading prop)", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={null}
        />
      );

      // Should NOT have a spinner by default - use isLoading prop to show spinner
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).not.toBeInTheDocument();
    });

    it("does not show spinner when verification has no status (use isLoading prop)", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={{}}
        />
      );

      // Should NOT have a spinner by default - use isLoading prop to show spinner
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).not.toBeInTheDocument();
    });

    it("shows spinner when isLoading prop is true", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={null}
          isLoading={true}
        />
      );

      // Should have a spinner when isLoading is true
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).toBeInTheDocument();
    });

    it("does NOT show spinner with isLoading when verification has definitive status", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          isLoading={true}
        />
      );

      // A definitive verification status should override isLoading
      // This prevents stuck spinners when we already have a result
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).not.toBeInTheDocument();

      // Should show the verified indicator instead
      const greenCheck = container.querySelector(".text-green-600");
      expect(greenCheck).toBeInTheDocument();
    });

    it("shows check icon for found status", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
        />
      );

      // Should NOT have a spinner
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).not.toBeInTheDocument();

      // Should have green check (text-green-600 class)
      const greenCheck = container.querySelector(".text-green-600");
      expect(greenCheck).toBeInTheDocument();
    });

    it("shows warning icon for not_found status", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={missVerification}
        />
      );

      // Should NOT have a spinner
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).not.toBeInTheDocument();

      // Should have amber warning (text-amber-500 class)
      const warningIcon = container.querySelector(".text-amber-500");
      expect(warningIcon).toBeInTheDocument();
    });

    it("shows amber check for partial match status", () => {
      const partialVerification: Verification = {
        matchSnippet: "partial text",
        pageNumber: 2,
        status: "found_on_other_page",
      };

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={partialVerification}
        />
      );

      // Should have amber check (text-amber-600 class)
      const amberCheck = container.querySelector(".text-amber-600");
      expect(amberCheck).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // SHOW INDICATOR PROP TESTS
  // ==========================================================================

  describe("showIndicator prop", () => {
    it("shows indicator by default (showIndicator=true)", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
        />
      );

      // Should have green check indicator
      const greenCheck = container.querySelector(".text-green-600");
      expect(greenCheck).toBeInTheDocument();
    });

    it("hides indicator when showIndicator=false", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          showIndicator={false}
        />
      );

      // Should NOT have any status indicators
      const greenCheck = container.querySelector(".text-green-600");
      const amberCheck = container.querySelector(".text-amber-600");
      const spinner = container.querySelector(".animate-spin");
      const warningIcon = container.querySelector(".text-amber-500");

      expect(greenCheck).not.toBeInTheDocument();
      expect(amberCheck).not.toBeInTheDocument();
      expect(spinner).not.toBeInTheDocument();
      expect(warningIcon).not.toBeInTheDocument();
    });

    it("hides spinner when showIndicator=false and isPending", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={pendingVerification}
          showIndicator={false}
        />
      );

      // Should NOT have spinner
      const spinner = container.querySelector(".animate-spin");
      expect(spinner).not.toBeInTheDocument();
    });

    it("custom renderIndicator takes precedence over showIndicator=false", () => {
      const customIndicator = <span data-testid="custom-indicator">Custom</span>;

      const { container, getByTestId } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          showIndicator={false}
          renderIndicator={() => customIndicator}
        />
      );

      // Custom indicator should still be rendered
      expect(getByTestId("custom-indicator")).toBeInTheDocument();

      // Default green check should NOT be rendered
      const greenCheck = container.querySelector(".text-green-600");
      expect(greenCheck).not.toBeInTheDocument();
    });

    it("hides warning indicator for not_found when showIndicator=false", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={missVerification}
          showIndicator={false}
        />
      );

      // Should NOT have warning indicator
      const warningIcon = container.querySelector(".text-amber-500");
      expect(warningIcon).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // DEFAULT BEHAVIOR TESTS
  // New simplified behavior:
  // - Hover: shows popover
  // - Click: opens image overlay directly (if image available)
  // ==========================================================================

  describe("default click behavior", () => {
    it("opens image overlay on click when image is available", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toBeInTheDocument();

      // Click should open image overlay directly
      fireEvent.click(citation!);

      // Image overlay should be visible
      const overlay = container.querySelector("[role='dialog']");
      expect(overlay).toBeInTheDocument();
    });

    it("closes image overlay when clicking overlay", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click to open image
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();

      // Click overlay to close
      const overlay = container.querySelector("[role='dialog']");
      fireEvent.click(overlay!);
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("does nothing on click when no image is available", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click should not open overlay (no image)
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("always calls eventHandlers.onClick", () => {
      const onClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          eventHandlers={{ onClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(
        baseCitation,
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // onClick REPLACES DEFAULT BEHAVIOR TESTS
  // ==========================================================================

  describe("onClick replaces default behavior", () => {
    it("prevents image from opening when onClick is provided (returns void)", () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click should not open image (onClick replaces default behavior)
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
      expect(customOnClick).toHaveBeenCalledTimes(1);
    });

    it("prevents image from opening when onClick returns false", () => {
      const customOnClick = jest.fn(() => false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Multiple clicks should not show image overlay
      fireEvent.click(citation!);
      fireEvent.click(citation!);
      fireEvent.click(citation!);

      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
      expect(customOnClick).toHaveBeenCalledTimes(3);
    });

    it("still calls eventHandlers.onClick when onClick is provided", () => {
      const eventHandlerOnClick = jest.fn();
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
          eventHandlers={{ onClick: eventHandlerOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnClick).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // CUSTOM onClick HANDLER TESTS
  // ==========================================================================

  describe("custom onClick handler", () => {
    it("receives correct context", () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      expect(customOnClick).toHaveBeenCalledTimes(1);

      const context = customOnClick.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.citation).toEqual(baseCitation);
      expect(context.citationKey).toBeDefined();
      expect(context.verification).toEqual(verificationWithImage);
      expect(context.isTooltipExpanded).toBe(false); // Not hovering
      expect(context.isImageExpanded).toBe(false);
      expect(context.hasImage).toBe(true);
    });

    it("replaces default behavior when returning void", () => {
      const customOnClick = jest.fn(() => {
        // Return nothing - no state changes
      });

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      // Custom handler was called
      expect(customOnClick).toHaveBeenCalledTimes(1);

      // No state changes occurred (onClick replaces defaults)
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("prevents any state changes when returning false", () => {
      const customOnClick = jest.fn(() => false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      // Custom handler was called
      expect(customOnClick).toHaveBeenCalledTimes(1);

      // Default behavior should NOT have occurred
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("applies returned actions to open image", () => {
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: true,
        })
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      // Custom action: image should be expanded
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("can apply setImageExpanded with string src", () => {
      const customImageSrc = "data:image/png;base64,customImage";
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: customImageSrc,
        })
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      const overlayImage = container.querySelector("[role='dialog'] img");
      expect(overlayImage).toBeInTheDocument();
      expect(overlayImage?.getAttribute("src")).toBe(customImageSrc);
    });

    it("can close image with setImageExpanded: false", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click to open image
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();

      // Click overlay to close
      const overlay = container.querySelector("[role='dialog']");
      fireEvent.click(overlay!);
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("still calls eventHandlers.onClick when custom handler returns actions", () => {
      const eventHandlerOnClick = jest.fn();
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: true,
        })
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
          eventHandlers={{ onClick: eventHandlerOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnClick).toHaveBeenCalledTimes(1);
    });

    it("still calls eventHandlers.onClick when custom handler returns false", () => {
      const eventHandlerOnClick = jest.fn();
      const customOnClick = jest.fn(() => false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
          eventHandlers={{ onClick: eventHandlerOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnClick).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // ANALYTICS USE CASE - eventHandlers for side effects
  // ==========================================================================

  describe("eventHandlers for analytics", () => {
    it("eventHandlers.onClick disables default behavior (no image opening)", () => {
      const trackingData: string[] = [];

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          eventHandlers={{
            onClick: (citation, citationKey) => {
              trackingData.push(`clicked:${citationKey}`);
            },
          }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click - analytics tracked but default behavior is disabled
      fireEvent.click(citation!);
      expect(trackingData).toHaveLength(1);
      // Default behavior (image opening) should NOT happen
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("eventHandlers.onClick runs even when behaviorConfig.onClick is provided", () => {
      const eventHandlerCalls: string[] = [];
      const behaviorConfigCalls: string[] = [];

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: (context) => {
              behaviorConfigCalls.push("behavior");
              return { setImageExpanded: true };
            },
          }}
          eventHandlers={{
            onClick: () => {
              eventHandlerCalls.push("event");
            },
          }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      // Both handlers were called
      expect(behaviorConfigCalls).toHaveLength(1);
      expect(eventHandlerCalls).toHaveLength(1);
    });
  });

  // ==========================================================================
  // CUSTOM onHover HANDLER TESTS
  // ==========================================================================

  describe("custom onHover handlers", () => {
    it("calls onHover.onEnter on mouse enter", () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onEnter } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseEnter(citation!);

      expect(onEnter).toHaveBeenCalledTimes(1);
    });

    it("calls onHover.onLeave on mouse leave", async () => {
      const onLeave = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onLeave } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseLeave(citation!);

      // Wait for hover close delay
      await act(async () => {
        await waitForHoverCloseDelay();
      });

      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it("provides correct context to onHover.onEnter", () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onEnter } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseEnter(citation!);

      const context = onEnter.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.citation).toEqual(baseCitation);
      expect(context.citationKey).toBeDefined();
      expect(context.verification).toEqual(verificationWithImage);
      expect(context.hasImage).toBe(true);
    });

    it("provides correct context to onHover.onLeave", async () => {
      const onLeave = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onLeave } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseLeave(citation!);

      // Wait for hover close delay
      await act(async () => {
        await waitForHoverCloseDelay();
      });

      const context = onLeave.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.citation).toEqual(baseCitation);
      expect(context.hasImage).toBe(true);
    });

    it("still calls eventHandlers.onMouseEnter", () => {
      const behaviorOnEnter = jest.fn();
      const eventHandlerOnEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onEnter: behaviorOnEnter } }}
          eventHandlers={{ onMouseEnter: eventHandlerOnEnter }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseEnter(citation!);

      expect(behaviorOnEnter).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnEnter).toHaveBeenCalledTimes(1);
    });

    it("still calls eventHandlers.onMouseLeave", async () => {
      const behaviorOnLeave = jest.fn();
      const eventHandlerOnLeave = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onLeave: behaviorOnLeave } }}
          eventHandlers={{ onMouseLeave: eventHandlerOnLeave }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseLeave(citation!);

      // Wait for hover close delay
      await act(async () => {
        await waitForHoverCloseDelay();
      });

      expect(behaviorOnLeave).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnLeave).toHaveBeenCalledTimes(1);
    });

    it("works with only onEnter provided", () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onEnter } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Should not throw when leaving without onLeave handler
      fireEvent.mouseEnter(citation!);
      fireEvent.mouseLeave(citation!);

      expect(onEnter).toHaveBeenCalledTimes(1);
    });

    it("works with only onLeave provided", async () => {
      const onLeave = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onLeave } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Should not throw when entering without onEnter handler
      fireEvent.mouseEnter(citation!);
      fireEvent.mouseLeave(citation!);

      // Wait for hover close delay
      await act(async () => {
        await waitForHoverCloseDelay();
      });

      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // COMBINED CONFIGURATION TESTS
  // ==========================================================================

  describe("combined configurations", () => {
    it("custom onClick returning actions applies them", () => {
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: true,
        })
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: customOnClick,
          }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      // Custom action was applied
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("onHover works independently of click configuration", async () => {
      const onEnter = jest.fn();
      const onLeave = jest.fn();
      const customOnClick = jest.fn(); // onClick provided, so default click behavior is replaced

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: customOnClick,
            onHover: { onEnter, onLeave },
          }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      fireEvent.mouseEnter(citation!);
      expect(onEnter).toHaveBeenCalledTimes(1);

      fireEvent.mouseLeave(citation!);

      // Wait for hover close delay
      await act(async () => {
        await waitForHoverCloseDelay();
      });

      expect(onLeave).toHaveBeenCalledTimes(1);

      // Click behavior is replaced by custom onClick (which does nothing)
      fireEvent.click(citation!);
      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("context is updated between clicks when using custom onClick", () => {
      const contexts: CitationBehaviorContext[] = [];
      const customOnClick = jest.fn(
        (context: CitationBehaviorContext): CitationBehaviorActions => {
          contexts.push({ ...context });
          // Toggle image
          if (context.isImageExpanded) {
            return { setImageExpanded: false };
          } else {
            return { setImageExpanded: true };
          }
        }
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First click - image not expanded yet
      fireEvent.click(citation!);
      expect(contexts[0].isImageExpanded).toBe(false);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();

      // Second click - image should now be expanded
      fireEvent.click(citation!);
      expect(contexts[1].isImageExpanded).toBe(true);
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe("edge cases", () => {
    it("handles undefined behaviorConfig gracefully", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={undefined}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Should work with default behavior
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("handles empty behaviorConfig object", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{}}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Should work with default behavior
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("handles verification without image correctly in context", () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          behaviorConfig={{ onHover: { onEnter } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseEnter(citation!);

      const context = onEnter.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.hasImage).toBe(false);
    });

    it("handles null verification correctly in context", () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={null}
          behaviorConfig={{ onHover: { onEnter } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseEnter(citation!);

      const context = onEnter.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.verification).toBeNull();
      expect(context.hasImage).toBe(false);
    });

    it("handles miss verification correctly", () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={missVerification}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      const context = customOnClick.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.hasImage).toBe(false);
    });
  });
});
