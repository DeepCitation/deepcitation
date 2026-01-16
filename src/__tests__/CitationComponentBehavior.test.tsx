import { afterEach, describe, expect, it, jest, mock } from "@jest/globals";
import { cleanup, fireEvent, render } from "@testing-library/react";
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

describe("CitationComponent behaviorConfig", () => {
  afterEach(() => {
    cleanup();
  });

  // Test fixtures
  const baseCitation: Citation = {
    citationNumber: 1,
    keySpan: "test citation",
    fullPhrase: "This is a test citation phrase",
  };

  const verificationWithImage: Verification = {
    verificationImageBase64: "data:image/png;base64,iVBORw0KGgo=",
    verifiedMatchSnippet: "test citation phrase",
    verifiedPageNumber: 1,
    status: "found",
  };

  const verificationWithoutImage: Verification = {
    verifiedMatchSnippet: "test citation phrase",
    verifiedPageNumber: 1,
    status: "found",
  };

  const missVerification: Verification = {
    verifiedMatchSnippet: "",
    verifiedPageNumber: 0,
    status: "not_found",
  };

  const pendingVerification: Verification = {
    status: "pending",
  };

  // ==========================================================================
  // DEFAULT BEHAVIOR TESTS
  // ==========================================================================

  describe("default click behavior", () => {
    it("pins popover on first click when image is available", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector(".dc-citation");
      expect(citation).toBeInTheDocument();
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");

      // First click should pin the popover
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");
    });

    it("expands image on second click when image is available", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // First click - pin popover
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");

      // Second click - should show image overlay
      fireEvent.click(citation!);

      // Image overlay should be visible
      const overlay = container.querySelector(".dc-overlay");
      expect(overlay).toBeInTheDocument();
    });

    it("closes image and unpins on third click", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // First click - pin popover
      fireEvent.click(citation!);

      // Second click - expand image
      fireEvent.click(citation!);
      expect(container.querySelector(".dc-overlay")).toBeInTheDocument();

      // Third click - close everything
      fireEvent.click(citation!);
      expect(container.querySelector(".dc-overlay")).not.toBeInTheDocument();
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
    });

    it("toggles popover when no image is available", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // First click - should toggle tooltip
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");

      // Second click - should toggle back
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
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

      const citation = container.querySelector(".dc-citation");
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
    it("prevents popover from pinning when onClick is provided (returns void)", () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector(".dc-citation");
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");

      // Click should not pin the popover (onClick replaces default behavior)
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
      expect(customOnClick).toHaveBeenCalledTimes(1);
    });

    it("prevents image from expanding when onClick is provided", () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // Multiple clicks should not show image overlay
      fireEvent.click(citation!);
      fireEvent.click(citation!);
      fireEvent.click(citation!);

      expect(container.querySelector(".dc-overlay")).not.toBeInTheDocument();
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnClick).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // CUSTOM onClick TO DISABLE SPECIFIC BEHAVIORS
  // ==========================================================================

  describe("custom onClick to disable specific behaviors", () => {
    it("can disable image expand while keeping popover pin", () => {
      // Custom onClick that only pins popover, never expands image
      const customOnClick = jest.fn(
        (context: CitationBehaviorContext): CitationBehaviorActions | false => {
          if (context.isImageExpanded) {
            // Close image and unpin
            return { setImageExpanded: false, setTooltipExpanded: false };
          } else if (context.isTooltipExpanded) {
            // Already pinned - do nothing (don't expand image)
            return false;
          } else {
            // First click - pin popover
            return { setTooltipExpanded: true };
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

      const citation = container.querySelector(".dc-citation");

      // First click - pin popover
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");

      // Second click - should NOT show image overlay (custom behavior)
      fireEvent.click(citation!);
      expect(container.querySelector(".dc-overlay")).not.toBeInTheDocument();

      // Popover should still be pinned
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");
    });

    it("can disable popover pinning entirely", () => {
      const customOnClick = jest.fn(() => false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
    });

    it("still calls eventHandlers.onClick when custom onClick returns false", () => {
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

      const citation = container.querySelector(".dc-citation");
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      expect(customOnClick).toHaveBeenCalledTimes(1);

      const context = customOnClick.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.citation).toEqual(baseCitation);
      expect(context.citationKey).toBeDefined();
      expect(context.verification).toEqual(verificationWithImage);
      expect(context.isTooltipExpanded).toBe(false);
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      // Custom handler was called
      expect(customOnClick).toHaveBeenCalledTimes(1);

      // No state changes occurred (onClick replaces defaults)
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      // Custom handler was called
      expect(customOnClick).toHaveBeenCalledTimes(1);

      // Default behavior should NOT have occurred
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
    });

    it("applies returned actions instead of default behavior", () => {
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      // Custom action: image should be expanded immediately
      expect(container.querySelector(".dc-overlay")).toBeInTheDocument();

      // Default behavior (pinning first) was skipped
      // Note: popover is NOT pinned because we returned custom actions
    });

    it("can apply setTooltipExpanded action", () => {
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setTooltipExpanded: true,
        })
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      const overlayImage = container.querySelector(".dc-overlay-image");
      expect(overlayImage).toBeInTheDocument();
      expect(overlayImage?.getAttribute("src")).toBe(customImageSrc);
    });

    it("can close image with setImageExpanded: false", () => {
      // First, render and expand the image normally
      const { container, rerender } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // Click twice to expand image
      fireEvent.click(citation!);
      fireEvent.click(citation!);
      expect(container.querySelector(".dc-overlay")).toBeInTheDocument();

      // Now add a custom handler that closes the image
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: false,
        })
      );

      rerender(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />
      );

      // Click again with custom handler
      fireEvent.click(citation!);

      expect(container.querySelector(".dc-overlay")).not.toBeInTheDocument();
    });

    it("still calls eventHandlers.onClick when custom handler returns actions", () => {
      const eventHandlerOnClick = jest.fn();
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setTooltipExpanded: true,
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

      const citation = container.querySelector(".dc-citation");
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnClick).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // ANALYTICS USE CASE - eventHandlers for side effects
  // ==========================================================================

  describe("eventHandlers for analytics", () => {
    it("eventHandlers.onClick disables default behavior (no popover pinning)", () => {
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

      const citation = container.querySelector(".dc-citation");

      // First click - analytics tracked but default behavior is disabled
      fireEvent.click(citation!);
      expect(trackingData).toHaveLength(1);
      // Default behavior (tooltip expansion) should NOT happen
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");

      // Second click - analytics tracked, still no default behavior
      fireEvent.click(citation!);
      expect(trackingData).toHaveLength(2);
      // Image overlay should NOT appear since defaults are disabled
      expect(container.querySelector(".dc-overlay")).not.toBeInTheDocument();
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
              return { setTooltipExpanded: true };
            },
          }}
          eventHandlers={{
            onClick: () => {
              eventHandlerCalls.push("event");
            },
          }}
        />
      );

      const citation = container.querySelector(".dc-citation");
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.mouseEnter(citation!);

      expect(onEnter).toHaveBeenCalledTimes(1);
    });

    it("calls onHover.onLeave on mouse leave", () => {
      const onLeave = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onLeave } }}
        />
      );

      const citation = container.querySelector(".dc-citation");
      fireEvent.mouseLeave(citation!);

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

      const citation = container.querySelector(".dc-citation");
      fireEvent.mouseEnter(citation!);

      const context = onEnter.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.citation).toEqual(baseCitation);
      expect(context.citationKey).toBeDefined();
      expect(context.verification).toEqual(verificationWithImage);
      expect(context.hasImage).toBe(true);
    });

    it("provides correct context to onHover.onLeave", () => {
      const onLeave = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onLeave } }}
        />
      );

      const citation = container.querySelector(".dc-citation");
      fireEvent.mouseLeave(citation!);

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

      const citation = container.querySelector(".dc-citation");
      fireEvent.mouseEnter(citation!);

      expect(behaviorOnEnter).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnEnter).toHaveBeenCalledTimes(1);
    });

    it("still calls eventHandlers.onMouseLeave", () => {
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.mouseLeave(citation!);

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

      const citation = container.querySelector(".dc-citation");

      // Should not throw when leaving without onLeave handler
      fireEvent.mouseEnter(citation!);
      fireEvent.mouseLeave(citation!);

      expect(onEnter).toHaveBeenCalledTimes(1);
    });

    it("works with only onLeave provided", () => {
      const onLeave = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onLeave } }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // Should not throw when entering without onEnter handler
      fireEvent.mouseEnter(citation!);
      fireEvent.mouseLeave(citation!);

      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // COMBINED CONFIGURATION TESTS
  // ==========================================================================

  describe("combined configurations", () => {
    it("custom onClick returning actions always applies them", () => {
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setTooltipExpanded: true,
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      // Custom action was applied
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");
    });

    it("onHover works independently of click configuration", () => {
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

      const citation = container.querySelector(".dc-citation");

      fireEvent.mouseEnter(citation!);
      expect(onEnter).toHaveBeenCalledTimes(1);

      fireEvent.mouseLeave(citation!);
      expect(onLeave).toHaveBeenCalledTimes(1);

      // Click behavior is replaced by custom onClick (which does nothing)
      fireEvent.click(citation!);
      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
    });

    it("context is updated between clicks when using custom onClick", () => {
      const contexts: CitationBehaviorContext[] = [];
      const customOnClick = jest.fn(
        (context: CitationBehaviorContext): CitationBehaviorActions => {
          contexts.push({ ...context });
          // Manually implement the default behavior
          if (context.isImageExpanded) {
            return { setImageExpanded: false, setTooltipExpanded: false };
          } else if (context.isTooltipExpanded) {
            return { setImageExpanded: true };
          } else {
            return { setTooltipExpanded: true };
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

      const citation = container.querySelector(".dc-citation");

      // First click - tooltip not expanded yet
      fireEvent.click(citation!);
      expect(contexts[0].isTooltipExpanded).toBe(false);
      expect(contexts[0].isImageExpanded).toBe(false);

      // Second click - tooltip should now be expanded
      fireEvent.click(citation!);
      expect(contexts[1].isTooltipExpanded).toBe(true);
      expect(contexts[1].isImageExpanded).toBe(false);

      // Third click - image should now be expanded
      fireEvent.click(citation!);
      expect(contexts[2].isTooltipExpanded).toBe(true);
      expect(contexts[2].isImageExpanded).toBe(true);
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

      const citation = container.querySelector(".dc-citation");

      // Should work with default behavior
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");
    });

    it("handles empty behaviorConfig object", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{}}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // Should work with default behavior
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");
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

      const citation = container.querySelector(".dc-citation");
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

      const citation = container.querySelector(".dc-citation");
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

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      const context = customOnClick.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.hasImage).toBe(false);
    });
  });
});
