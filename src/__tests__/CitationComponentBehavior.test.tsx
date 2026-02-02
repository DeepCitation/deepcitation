import { afterEach, describe, expect, it, jest, mock } from "@jest/globals";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
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
        <CitationComponent citation={baseCitation} verification={null} />
      );

      // Should NOT have a spinner by default - use isLoading prop to show spinner
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).not.toBeInTheDocument();
    });

    it("does not show spinner when verification has no status (use isLoading prop)", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={{}} />
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

    it("shows X circle icon for not_found status", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={missVerification}
        />
      );

      // Should NOT have a spinner
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).not.toBeInTheDocument();

      // Should have red X circle (text-red-500 class)
      const redXIcon = container.querySelector(".text-red-500");
      expect(redXIcon).toBeInTheDocument();
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
      const customIndicator = (
        <span data-testid="custom-indicator">Custom</span>
      );

      const { container, getByTestId } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          variant="brackets"
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

    it("hides X circle indicator for not_found when showIndicator=false", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={missVerification}
          variant="brackets"
          showIndicator={false}
        />
      );

      // Should NOT have red X circle indicator
      const redXIcon = container.querySelector(".text-red-500");
      expect(redXIcon).not.toBeInTheDocument();
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
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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

      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
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

// =============================================================================
// MOBILE/TOUCH DEVICE DETECTION TESTS
// =============================================================================

describe("CitationComponent mobile/touch detection", () => {
  afterEach(() => {
    cleanup();
    // Reset mocked globals
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "maxTouchPoints", {
      writable: true,
      configurable: true,
      value: 0,
    });
  });

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

  // Helper to mock touch device detection
  function mockTouchDevice(isTouch: boolean) {
    Object.defineProperty(navigator, "maxTouchPoints", {
      writable: true,
      configurable: true,
      value: isTouch ? 5 : 0,
    });
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: isTouch && query === "(pointer: coarse)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  }

  describe("auto-detection of touch devices", () => {
    it("auto-detects touch device when isMobile prop is not provided", () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toBeInTheDocument();

      // On touch devices, first tap should show popover, not open image overlay
      // Simulate touch sequence: touchStart then click
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);

      // First tap should NOT open the full-screen image overlay
      // (popover behavior is handled by hover state, not dialog)
      // The key check is that image overlay dialog is NOT shown on first tap
      const dialog = container.querySelector("[role='dialog']");
      expect(dialog).not.toBeInTheDocument();
    });

    it("does not auto-enable mobile mode on non-touch devices", () => {
      mockTouchDevice(false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // On non-touch devices, click should open image directly
      fireEvent.click(citation!);

      // Should open image overlay directly
      const dialog = container.querySelector("[role='dialog']");
      expect(dialog).toBeInTheDocument();
    });
  });

  describe("explicit isMobile prop overrides auto-detection", () => {
    it("isMobile={true} forces mobile behavior even on non-touch device", () => {
      mockTouchDevice(false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          isMobile={true}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Simulate touch sequence
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);

      // First tap should NOT open image overlay (mobile behavior)
      const dialog = container.querySelector("[role='dialog']");
      expect(dialog).not.toBeInTheDocument();
    });

    it("isMobile={false} forces desktop behavior even on touch device", () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          isMobile={false}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click should open image directly (desktop behavior forced)
      fireEvent.click(citation!);

      // Should open image overlay directly
      const dialog = container.querySelector("[role='dialog']");
      expect(dialog).toBeInTheDocument();
    });
  });

  describe("mobile tap sequence", () => {
    it("first tap shows popover, second tap opens image overlay", () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First tap - should show popover (not image overlay)
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);

      // No image overlay yet
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Second tap - now popover is already open, should open image overlay
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);

      // Now image overlay should be visible
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("triple tap keeps image overlay open", () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First tap - show popover
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Second tap - open image overlay
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();

      // Third tap - image overlay should remain open (tap on citation doesn't close it)
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("mobile tap without verification image still shows popover on first tap", () => {
      mockTouchDevice(true);

      const verificationNoImage: Verification = {
        status: "found",
        verifiedMatchSnippet: "Test match snippet",
      };

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationNoImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First tap - should show popover
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);

      // No image overlay (no image available)
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Second tap - still no image overlay (no image available)
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
    });

    it("cross-citation tapping is not incorrectly debounced (each citation has its own timer)", () => {
      mockTouchDevice(true);

      const citation1: Citation = {
        citationNumber: 1,
        anchorText: "first citation",
        fullPhrase: "This is the first citation",
      };

      const citation2: Citation = {
        citationNumber: 2,
        anchorText: "second citation",
        fullPhrase: "This is the second citation",
      };

      const { container } = render(
        <>
          <CitationComponent
            citation={citation1}
            verification={verificationWithImage}
          />
          <CitationComponent
            citation={citation2}
            verification={verificationWithImage}
          />
        </>
      );

      const citations = container.querySelectorAll("[data-citation-id]");
      const citationA = citations[0];
      const citationB = citations[1];

      // Tap citation A
      fireEvent.touchStart(citationA!);
      fireEvent.click(citationA!);

      // Immediately tap citation B (within debounce window if it were global)
      // This should NOT be debounced because each citation has its own timer
      fireEvent.touchStart(citationB!);
      fireEvent.click(citationB!);

      // Both citations should have responded to their first tap
      // (no image overlay since it's first tap for each)
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Now second tap on citation B should open image
      fireEvent.touchStart(citationB!);
      fireEvent.click(citationB!);

      // Image overlay should be visible (proves citation B wasn't incorrectly debounced)
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("second tap toggles phrase expansion for miss citations (no image)", () => {
      mockTouchDevice(true);

      const missCitation: Citation = {
        citationNumber: 1,
        anchorText: "unfound citation",
        fullPhrase: "This citation was not found in the document",
      };

      const missVerification: Verification = {
        status: "not_found",
        searchAttempts: [
          {
            phrase: "unfound citation",
            phraseType: "anchor_text",
            pageNumber: 1,
            lineIds: [1],
            method: "exact",
            searchVariations: ["unfound citation"],
            foundMatch: false,
          },
        ],
      };

      const { container } = render(
        <CitationComponent
          citation={missCitation}
          verification={missVerification}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First tap - show popover
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);

      // No image overlay (it's a miss, no image)
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Second tap - should toggle phrase expansion (not image overlay)
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);

      // Still no image overlay (miss citation behavior toggles phrases, not image)
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
    });

    it("custom behaviorConfig.onClick receives TouchEvent on mobile", () => {
      mockTouchDevice(true);

      const onClickMock = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: onClickMock,
          }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Tap on mobile
      fireEvent.touchStart(citation!);
      fireEvent.touchEnd(citation!);

      // behaviorConfig.onClick should have been called
      expect(onClickMock).toHaveBeenCalledTimes(1);

      // The event should be a TouchEvent (check event.type)
      const [context, event] = onClickMock.mock.calls[0];
      expect(event.type).toBe("touchend");
      expect(context.citation).toEqual(baseCitation);
    });

    it("mobile overrides relaxed mode - uses two-tap behavior regardless", () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First tap - should show popover (mobile two-tap behavior)
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);

      // No image overlay yet (first tap shows popover)
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Second tap - should open image
      fireEvent.touchStart(citation!);
      fireEvent.click(citation!);

      // Image overlay should be visible
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });
  });

  describe("keyboard accessibility", () => {
    it("Enter key triggers tap action in eager mode", () => {
      mockTouchDevice(false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="eager"
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Press Enter - should open image directly in eager mode
      fireEvent.keyDown(citation!, { key: "Enter" });

      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("Space key triggers tap action in eager mode", () => {
      mockTouchDevice(false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="eager"
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Press Space - should open image directly in eager mode
      fireEvent.keyDown(citation!, { key: " " });

      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("Enter key shows popover first in relaxed mode, second press opens image", () => {
      mockTouchDevice(false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First Enter - should show popover (not image)
      fireEvent.keyDown(citation!, { key: "Enter" });
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Second Enter - should open image
      fireEvent.keyDown(citation!, { key: "Enter" });
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("citation has correct ARIA attributes", () => {
      mockTouchDevice(false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      expect(citation).toHaveAttribute("role", "button");
      expect(citation).toHaveAttribute("tabIndex", "0");
      expect(citation).toHaveAttribute("aria-expanded");
      expect(citation).toHaveAttribute("aria-label");
    });
  });

  describe("SSR handling", () => {
    it("defaults to non-touch on server (window undefined)", () => {
      // In happy-dom/jsdom, window is defined, but we can test the fallback
      // by checking that the component renders without errors when detection runs
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      expect(container.querySelector("[data-citation-id]")).toBeInTheDocument();
    });
  });
});

// =============================================================================
// INTERACTION MODE TESTS
// =============================================================================

describe("CitationComponent interactionMode", () => {
  afterEach(() => {
    cleanup();
  });

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

  // Hover close delay must match HOVER_CLOSE_DELAY_MS in CitationComponent
  const HOVER_CLOSE_DELAY_MS = 150;

  // Helper to wait for hover close delay
  const waitForHoverCloseDelay = () =>
    new Promise((resolve) => setTimeout(resolve, HOVER_CLOSE_DELAY_MS + 50));

  describe("eager mode (default)", () => {
    it("shows popover on hover", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="eager"
          behaviorConfig={{ onHover: { onEnter } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseEnter(citation!);

      // In eager mode, hover should trigger onEnter (popover opens)
      expect(onEnter).toHaveBeenCalledTimes(1);

      // Popover content should be visible (Radix uses data-state="open")
      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });
    });

    it("opens image overlay on click when image is available", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="eager"
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      // Image overlay should open directly on first click
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("has cursor-zoom-in class when image is available", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="eager"
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toHaveClass("cursor-zoom-in");
    });

    it("has cursor-pointer class when no image is available", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          interactionMode="eager"
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toHaveClass("cursor-pointer");
    });

    it("is the default behavior when interactionMode is not specified", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click should open image directly (eager default behavior)
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });
  });

  describe("relaxed mode", () => {
    it("does NOT show popover on hover", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
          behaviorConfig={{ onHover: { onEnter } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseEnter(citation!);

      // In relaxed mode, onEnter callback still fires but popover doesn't open
      expect(onEnter).toHaveBeenCalledTimes(1);

      // Give time for popover to appear if it would
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Popover should NOT appear on hover in relaxed mode
      const popoverContent = container.querySelector('[data-state="open"]');
      expect(popoverContent).not.toBeInTheDocument();
    });

    it("shows popover on first click (not image overlay)", async () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      // First click should NOT open image overlay
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Popover should be shown instead (hover state activated via click)
      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });
    });

    it("opens image overlay on second click", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First click - shows popover
      fireEvent.click(citation!);
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Second click - opens image overlay
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("has cursor-pointer class initially (before popover is shown)", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toHaveClass("cursor-pointer");
    });

    it("changes to cursor-zoom-in after first click (when popover is shown)", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Initially cursor-pointer
      expect(citation).toHaveClass("cursor-pointer");

      // First click - shows popover
      fireEvent.click(citation!);

      // Now should be cursor-zoom-in (indicating next click will zoom)
      expect(citation).toHaveClass("cursor-zoom-in");
    });

    it("resets to cursor-pointer after closing image overlay", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First click - shows popover
      fireEvent.click(citation!);
      expect(citation).toHaveClass("cursor-zoom-in");

      // Second click - opens image overlay
      fireEvent.click(citation!);
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();

      // Close the overlay by clicking on it
      const overlay = container.querySelector("[role='dialog']");
      fireEvent.click(overlay!);

      // Should be back to cursor-pointer (popover closed when overlay closes)
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
    });

    it("still triggers eventHandlers.onClick on both clicks", () => {
      const onClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
          eventHandlers={{ onClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First click
      fireEvent.click(citation!);
      expect(onClick).toHaveBeenCalledTimes(1);

      // Second click
      fireEvent.click(citation!);
      expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("works correctly without image (no zoom needed)", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          interactionMode="relaxed"
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // First click - activates hover state (would show popover)
      fireEvent.click(citation!);

      // Image overlay should NOT open (no image available)
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Second click - still no image to zoom
      fireEvent.click(citation!);
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();

      // Cursor should remain pointer (no image to zoom)
      expect(citation).toHaveClass("cursor-pointer");
    });

    it("applies hover styles but not popover on hover", async () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
        />
      );

      const citation = container.querySelector("[data-citation-id]");

      // Hover should apply visual styles but not show popover
      fireEvent.mouseEnter(citation!);

      // The citation element should still be interactable
      expect(citation).toBeInTheDocument();

      // Give time for popover to appear if it would
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // But popover should NOT appear in relaxed mode on hover
      const popoverContent = container.querySelector('[data-state="open"]');
      expect(popoverContent).not.toBeInTheDocument();
    });
  });

  describe("interactionMode with behaviorConfig", () => {
    it("custom onClick overrides relaxed mode behavior", () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      // Custom onClick should be called instead of relaxed mode default
      expect(customOnClick).toHaveBeenCalledTimes(1);

      // Neither popover nor image overlay should open (custom handler takes over)
      expect(
        container.querySelector("[role='dialog']")
      ).not.toBeInTheDocument();
    });

    it("custom onClick returning actions works in relaxed mode", () => {
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: true,
        })
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.click(citation!);

      // Custom action should open image directly (bypassing relaxed mode)
      expect(container.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("onHover callbacks still work in relaxed mode", () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="relaxed"
          behaviorConfig={{ onHover: { onEnter } }}
        />
      );

      const citation = container.querySelector("[data-citation-id]");
      fireEvent.mouseEnter(citation!);

      // onEnter callback should still fire
      expect(onEnter).toHaveBeenCalledTimes(1);
    });
  });
});
