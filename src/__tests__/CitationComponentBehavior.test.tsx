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
    matchSnippet: "test citation phrase",
    pageNumber: 1,
    isVerified: true,
    isPartialMatch: false,
  };

  const verificationWithoutImage: Verification = {
    matchSnippet: "test citation phrase",
    pageNumber: 1,
    isVerified: true,
    isPartialMatch: false,
  };

  const missVerification: Verification = {
    matchSnippet: "",
    pageNumber: 0,
    isVerified: false,
    isPartialMatch: false,
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
  // disableImageExpand TESTS
  // ==========================================================================

  describe("disableImageExpand", () => {
    it("still pins popover on first click", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ disableImageExpand: true }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");
    });

    it("does not expand image on second click", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ disableImageExpand: true }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // First click - pin popover
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");

      // Second click - should NOT show image overlay
      fireEvent.click(citation!);
      expect(container.querySelector(".dc-overlay")).not.toBeInTheDocument();

      // Popover should still be pinned
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");
    });

    it("allows pinning/unpinning without image expansion", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          behaviorConfig={{ disableImageExpand: true }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // First click - pin
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");

      // Second click - unpin (no image to expand anyway)
      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
    });
  });

  // ==========================================================================
  // disablePopoverPin TESTS
  // ==========================================================================

  describe("disablePopoverPin", () => {
    it("does not pin popover on click", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ disablePopoverPin: true }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
    });

    it("does not expand phrases on click when no image", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          behaviorConfig={{ disablePopoverPin: true }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      fireEvent.click(citation!);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
    });

    it("still calls eventHandlers.onClick", () => {
      const onClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ disablePopoverPin: true }}
          eventHandlers={{ onClick }}
        />
      );

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      expect(onClick).toHaveBeenCalledTimes(1);
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

    it("replaces default behavior when returning void (no extendDefaultClickBehavior)", () => {
      const customOnClick = jest.fn(() => {
        // Return nothing - default behavior should NOT proceed
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

      // Default behavior should NOT have occurred (onClick replaces defaults)
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
    });

    it("allows default behavior when extendDefaultClickBehavior is true", () => {
      const customOnClick = jest.fn(() => {
        // Return nothing - default behavior should proceed because of extendDefaultClickBehavior
      });

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: customOnClick,
            extendDefaultClickBehavior: true,
          }}
        />
      );

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      // Custom handler was called
      expect(customOnClick).toHaveBeenCalledTimes(1);

      // Default behavior should have pinned the popover
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");
    });

    it("prevents default behavior when returning false", () => {
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
  // extendDefaultClickBehavior TESTS
  // ==========================================================================

  describe("extendDefaultClickBehavior", () => {
    it("runs default behavior after onClick when extendDefaultClickBehavior is true", () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: customOnClick,
            extendDefaultClickBehavior: true,
          }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // First click - should pin popover (default behavior)
      fireEvent.click(citation!);
      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");

      // Second click - should expand image (default behavior)
      fireEvent.click(citation!);
      expect(customOnClick).toHaveBeenCalledTimes(2);
      expect(container.querySelector(".dc-overlay")).toBeInTheDocument();
    });

    it("does not run default behavior when onClick returns actions even with extendDefaultClickBehavior", () => {
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
            extendDefaultClickBehavior: true,
          }}
        />
      );

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      // Actions were applied
      expect(container.querySelector(".dc-overlay")).toBeInTheDocument();

      // But popover was NOT pinned (default behavior was skipped because actions were returned)
      // The image is shown directly without pinning first
    });

    it("does not run default behavior when onClick returns false even with extendDefaultClickBehavior", () => {
      const customOnClick = jest.fn(() => false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: customOnClick,
            extendDefaultClickBehavior: true,
          }}
        />
      );

      const citation = container.querySelector(".dc-citation");
      fireEvent.click(citation!);

      // Default behavior was prevented
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("false");
    });

    it("allows analytics use case: track clicks while keeping defaults", () => {
      const trackingData: string[] = [];
      const customOnClick = jest.fn((context: CitationBehaviorContext) => {
        trackingData.push(`clicked:${context.citationKey}`);
        // Return nothing to let defaults run
      });

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: customOnClick,
            extendDefaultClickBehavior: true,
          }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      fireEvent.click(citation!);
      expect(trackingData).toHaveLength(1);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");

      fireEvent.click(citation!);
      expect(trackingData).toHaveLength(2);
      expect(container.querySelector(".dc-overlay")).toBeInTheDocument();
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
    it("custom onClick can work alongside disableImageExpand with extendDefaultClickBehavior", () => {
      const customOnClick = jest.fn(() => {
        // Return void - defaults run because of extendDefaultClickBehavior
      });

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: customOnClick,
            extendDefaultClickBehavior: true,
            disableImageExpand: true,
          }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // First click - pins popover (default behavior)
      fireEvent.click(citation!);
      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(citation?.getAttribute("data-tooltip-expanded")).toBe("true");

      // Second click - image should NOT expand due to disableImageExpand
      fireEvent.click(citation!);
      expect(customOnClick).toHaveBeenCalledTimes(2);
      expect(container.querySelector(".dc-overlay")).not.toBeInTheDocument();
    });

    it("custom onClick returning actions always applies them", () => {
      // Custom actions should be applied regardless of other settings
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

    it("all handlers receive updated context after state changes with extendDefaultClickBehavior", () => {
      const contexts: CitationBehaviorContext[] = [];
      const customOnClick = jest.fn((context: CitationBehaviorContext) => {
        contexts.push({ ...context });
        // Return void to allow default behavior (with extendDefaultClickBehavior)
      });

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: customOnClick,
            extendDefaultClickBehavior: true,
          }}
        />
      );

      const citation = container.querySelector(".dc-citation");

      // First click - tooltip not expanded yet
      fireEvent.click(citation!);
      expect(contexts[0].isTooltipExpanded).toBe(false);

      // Second click - tooltip should now be expanded
      fireEvent.click(citation!);
      expect(contexts[1].isTooltipExpanded).toBe(true);

      // Third click - image should now be expanded
      fireEvent.click(citation!);
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
