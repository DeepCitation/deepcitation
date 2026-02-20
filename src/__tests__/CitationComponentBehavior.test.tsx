import { afterEach, beforeEach, describe, expect, it, mock } from "@jest/globals";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type React from "react";
import { CitationComponent } from "../react/CitationComponent";
import type { CitationBehaviorActions, CitationBehaviorContext } from "../react/types";
import type { Citation } from "../types/citation";
import type { Verification } from "../types/verification";

// Mock createPortal to render content in place instead of portal
// This allows us to query overlay elements in the same container
mock.module("react-dom", () => ({
  createPortal: (node: React.ReactNode) => node,
}));

// Helper to wait for popover to become visible
const waitForPopoverVisible = async (container: HTMLElement) => {
  await act(async () => {
    await waitFor(() => {
      const popover = container.querySelector('[data-state="open"]');
      expect(popover).toBeInTheDocument();
    });
  });
};

// Helper to wait for popover to be dismissed
const waitForPopoverDismissed = async (container: HTMLElement) => {
  await act(async () => {
    await waitFor(() => {
      const popover = container.querySelector('[data-state="open"]');
      expect(popover).not.toBeInTheDocument();
    });
  });
};

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
    document: {
      verificationImageSrc: "data:image/png;base64,iVBORw0KGgo=",
    },
    verifiedMatchSnippet: "test citation phrase",
    status: "found",
  };

  const verificationWithoutImage: Verification = {
    verifiedMatchSnippet: "test citation phrase",
    status: "found",
  };

  const missVerification: Verification = {
    verifiedMatchSnippet: "",
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
      const { container } = render(<CitationComponent citation={baseCitation} verification={pendingVerification} />);

      // Should have a spinner (svg with animate-spin class)
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).toBeInTheDocument();
    });

    it("does not show spinner when verification is null (use isLoading prop)", () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={null} />);

      // Should NOT have a spinner by default - use isLoading prop to show spinner
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).not.toBeInTheDocument();
    });

    it("does not show spinner when verification has no status (use isLoading prop)", () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={{}} />);

      // Should NOT have a spinner by default - use isLoading prop to show spinner
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).not.toBeInTheDocument();
    });

    it("shows spinner when isLoading prop is true", () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={null} isLoading={true} />);

      // Should have a spinner when isLoading is true
      const spinner = container.querySelector(".animate-spin svg");
      expect(spinner).toBeInTheDocument();
    });

    it("does NOT show spinner with isLoading when verification has definitive status", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithoutImage} isLoading={true} />,
      );

      // A definitive verification status should override isLoading
      // This prevents stuck spinners when we already have a result
      const spinner = container.querySelector("[data-dc-indicator='pending']");
      expect(spinner).not.toBeInTheDocument();

      // Should show the verified indicator instead
      const greenCheck = container.querySelector("[data-dc-indicator='verified']");
      expect(greenCheck).toBeInTheDocument();
    });

    it("shows check icon for found status", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithoutImage} />,
      );

      // Should NOT have a spinner
      const spinner = container.querySelector("[data-dc-indicator='pending']");
      expect(spinner).not.toBeInTheDocument();

      // Should have verified indicator
      const greenCheck = container.querySelector("[data-dc-indicator='verified']");
      expect(greenCheck).toBeInTheDocument();
    });

    it("shows X circle icon for not_found status", () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={missVerification} />);

      // Should NOT have a spinner
      const spinner = container.querySelector("[data-dc-indicator='pending']");
      expect(spinner).not.toBeInTheDocument();

      // Should have error indicator
      const redXIcon = container.querySelector("[data-dc-indicator='error']");
      expect(redXIcon).toBeInTheDocument();
    });

    it("shows amber check for partial match status", () => {
      const partialVerification: Verification = {
        verifiedMatchSnippet: "partial text",
        status: "found_on_other_page",
      };

      const { container } = render(<CitationComponent citation={baseCitation} verification={partialVerification} />);

      // Should have partial match indicator
      const amberCheck = container.querySelector("[data-dc-indicator='partial']");
      expect(amberCheck).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // SHOW INDICATOR PROP TESTS
  // ==========================================================================

  describe("showIndicator prop", () => {
    it("shows indicator by default (showIndicator=true)", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithoutImage} />,
      );

      // Should have verified indicator
      const greenCheck = container.querySelector("[data-dc-indicator='verified']");
      expect(greenCheck).toBeInTheDocument();
    });

    it("hides indicator when showIndicator=false", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithoutImage} showIndicator={false} />,
      );

      // Should NOT have any status indicators
      const greenCheck = container.querySelector("[data-dc-indicator='verified']");
      const amberCheck = container.querySelector("[data-dc-indicator='partial']");
      const spinner = container.querySelector("[data-dc-indicator='pending']");

      expect(greenCheck).not.toBeInTheDocument();
      expect(amberCheck).not.toBeInTheDocument();
      expect(spinner).not.toBeInTheDocument();
    });

    it("hides spinner when showIndicator=false and isPending", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={pendingVerification} showIndicator={false} />,
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
          variant="brackets"
          showIndicator={false}
          renderIndicator={() => customIndicator}
        />,
      );

      // Custom indicator should still be rendered
      expect(getByTestId("custom-indicator")).toBeInTheDocument();

      // Default verified indicator should NOT be rendered
      const greenCheck = container.querySelector("[data-dc-indicator='verified']");
      expect(greenCheck).not.toBeInTheDocument();
    });

    it("hides X circle indicator for not_found when showIndicator=false", () => {
      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={missVerification}
          variant="brackets"
          showIndicator={false}
        />,
      );

      // Should NOT have error indicator
      const redXIcon = container.querySelector("[data-dc-indicator='error']");
      expect(redXIcon).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // DEFAULT BEHAVIOR TESTS
  // Simplified behavior (always lazy mode):
  // - Hover: style effects only (no popover)
  // - First Click: shows popover
  // - Second Click: closes popover
  // ==========================================================================

  describe("default click behavior", () => {
    it("shows popover on first click (not image overlay)", async () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toBeInTheDocument();

      // First click should show popover, NOT image overlay
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Image overlay should NOT be visible (first click shows popover)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Popover should be shown
      await waitForPopoverVisible(container);
    });

    it("closes popover on second click", async () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const citation = container.querySelector("[data-citation-id]");

      // First click - shows popover
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      await waitForPopoverVisible(container);

      // Second click - closes popover
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      await waitForPopoverDismissed(container);
    });

    it("does not open image overlay on click when no image is available", async () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithoutImage} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click should not open overlay (no image)
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });

    it("always calls eventHandlers.onClick", async () => {
      const onClick = jest.fn();

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} eventHandlers={{ onClick }} />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith(baseCitation, expect.any(String), expect.any(Object));
    });
  });

  // ==========================================================================
  // onClick REPLACES DEFAULT BEHAVIOR TESTS
  // ==========================================================================

  describe("onClick replaces default behavior", () => {
    it("prevents image from opening when onClick is provided (returns void)", async () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click should not open image (onClick replaces default behavior)
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
      expect(customOnClick).toHaveBeenCalledTimes(1);
    });

    it("prevents image from opening when onClick returns false", async () => {
      const customOnClick = jest.fn(() => false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Multiple clicks should not show image overlay
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
      expect(customOnClick).toHaveBeenCalledTimes(3);
    });

    it("still calls eventHandlers.onClick when onClick is provided", async () => {
      const eventHandlerOnClick = jest.fn();
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
          eventHandlers={{ onClick: eventHandlerOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnClick).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // CUSTOM onClick HANDLER TESTS
  // ==========================================================================

  describe("custom onClick handler", () => {
    it("receives correct context", async () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      expect(customOnClick).toHaveBeenCalledTimes(1);

      const context = customOnClick.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.citation).toEqual(baseCitation);
      expect(context.citationKey).toBeDefined();
      expect(context.verification).toEqual(verificationWithImage);
      expect(context.isTooltipExpanded).toBe(false); // Not hovering
      expect(context.isImageExpanded).toBe(false);
      expect(context.hasImage).toBe(true);
    });

    it("replaces default behavior when returning void", async () => {
      const customOnClick = jest.fn(() => {
        // Return nothing - no state changes
      });

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Custom handler was called
      expect(customOnClick).toHaveBeenCalledTimes(1);

      // No state changes occurred (onClick replaces defaults)
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("prevents any state changes when returning false", async () => {
      const customOnClick = jest.fn(() => false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Custom handler was called
      expect(customOnClick).toHaveBeenCalledTimes(1);

      // Default behavior should NOT have occurred
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("applies returned actions to open image", async () => {
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: true,
        }),
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Custom action: portal overlay renders in expanded-page state (no role="dialog" on portal div)
      // ExpandedPageViewer's SourceContextHeader renders a back button with this aria-label
      expect(document.querySelector("button[aria-label='Back to citation summary']")).toBeInTheDocument();
    });

    it("can apply setImageExpanded with string src", async () => {
      const customImageSrc = "data:image/png;base64,customImage";
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: customImageSrc,
        }),
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      const overlayImage = document.querySelector("img[alt='Full page verification']");
      expect(overlayImage).toBeInTheDocument();
      expect(overlayImage?.getAttribute("src")).toBe(customImageSrc);
    });

    it("rejects setImageExpanded string with javascript: URI (does not update src)", async () => {
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: "javascript:alert(1)",
        }),
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Expanded-page portal opens (setImageExpanded: true path) but custom src is rejected;
      // falls back to the baseline verificationImageSrc — not the malicious URI
      const overlayImage = document.querySelector("img[alt='Full page verification']");
      expect(overlayImage?.getAttribute("src")).not.toBe("javascript:alert(1)");
    });

    it("rejects setImageExpanded string with SVG data URI", async () => {
      const svgUri = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=";
      const customOnClick = jest.fn((): CitationBehaviorActions => ({ setImageExpanded: svgUri }));

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      const overlayImage = document.querySelector("img[alt='Full page verification']");
      expect(overlayImage?.getAttribute("src")).not.toBe(svgUri);
    });

    it("accepts setImageExpanded with trusted CDN URL", async () => {
      const trustedSrc = "https://cdn.deepcitation.com/proof/page1.avif";
      const customOnClick = jest.fn((): CitationBehaviorActions => ({ setImageExpanded: trustedSrc }));

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      const overlayImage = document.querySelector("img[alt='Full page verification']");
      expect(overlayImage).toBeInTheDocument();
      expect(overlayImage?.getAttribute("src")).toBe(trustedSrc);
    });

    it("can close image with setImageExpanded: false", async () => {
      // Use custom onClick to explicitly open image (since default behavior is lazy mode)
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: true,
        }),
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click to open image via custom onClick
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(document.querySelector("[role='dialog']")).toBeInTheDocument();

      // Click overlay to close (clicking the dialog backdrop itself triggers dismissal)
      const overlay = document.querySelector("[role='dialog']");
      await act(async () => {
        fireEvent.click(overlay as HTMLElement);
      });
      expect(document.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("still calls eventHandlers.onClick when custom handler returns actions", async () => {
      const eventHandlerOnClick = jest.fn();
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: true,
        }),
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
          eventHandlers={{ onClick: eventHandlerOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnClick).toHaveBeenCalledTimes(1);
    });

    it("still calls eventHandlers.onClick when custom handler returns false", async () => {
      const eventHandlerOnClick = jest.fn();
      const customOnClick = jest.fn(() => false);

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
          eventHandlers={{ onClick: eventHandlerOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnClick).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // ANALYTICS USE CASE - eventHandlers for side effects
  // ==========================================================================

  describe("eventHandlers for analytics", () => {
    it("eventHandlers.onClick disables default behavior (no image opening)", async () => {
      const trackingData: string[] = [];

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          eventHandlers={{
            onClick: (_citation, citationKey) => {
              trackingData.push(`clicked:${citationKey}`);
            },
          }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click - analytics tracked but default behavior is disabled
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(trackingData).toHaveLength(1);
      // Default behavior (image opening) should NOT happen
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("eventHandlers.onClick runs even when behaviorConfig.onClick is provided", async () => {
      const eventHandlerCalls: string[] = [];
      const behaviorConfigCalls: string[] = [];

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: _context => {
              behaviorConfigCalls.push("behavior");
              return { setImageExpanded: true };
            },
          }}
          eventHandlers={{
            onClick: () => {
              eventHandlerCalls.push("event");
            },
          }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Both handlers were called
      expect(behaviorConfigCalls).toHaveLength(1);
      expect(eventHandlerCalls).toHaveLength(1);
    });
  });

  // ==========================================================================
  // CUSTOM onHover HANDLER TESTS
  // ==========================================================================

  describe("custom onHover handlers", () => {
    it("calls onHover.onEnter on mouse enter", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onEnter } }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });

      expect(onEnter).toHaveBeenCalledTimes(1);
    });

    it("calls onHover.onLeave on mouse leave", async () => {
      const onLeave = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onLeave } }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseLeave(citation as HTMLElement);
      });

      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it("provides correct context to onHover.onEnter", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onEnter } }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });

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
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseLeave(citation as HTMLElement);
      });

      const context = onLeave.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.citation).toEqual(baseCitation);
      expect(context.hasImage).toBe(true);
    });

    it("still calls eventHandlers.onMouseEnter", async () => {
      const behaviorOnEnter = jest.fn();
      const eventHandlerOnEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onEnter: behaviorOnEnter } }}
          eventHandlers={{ onMouseEnter: eventHandlerOnEnter }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });

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
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseLeave(citation as HTMLElement);
      });

      expect(behaviorOnLeave).toHaveBeenCalledTimes(1);
      expect(eventHandlerOnLeave).toHaveBeenCalledTimes(1);
    });

    it("works with only onEnter provided", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onEnter } }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Should not throw when leaving without onLeave handler
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
        fireEvent.mouseLeave(citation as HTMLElement);
      });

      expect(onEnter).toHaveBeenCalledTimes(1);
    });

    it("works with only onLeave provided", async () => {
      const onLeave = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onHover: { onLeave } }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Should not throw when entering without onEnter handler
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
        fireEvent.mouseLeave(citation as HTMLElement);
      });

      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // COMBINED CONFIGURATION TESTS
  // ==========================================================================

  describe("combined configurations", () => {
    it("custom onClick returning actions applies them", async () => {
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: true,
        }),
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: customOnClick,
          }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Custom action was applied
      expect(document.querySelector("[role='dialog']")).toBeInTheDocument();
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
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });
      expect(onEnter).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.mouseLeave(citation as HTMLElement);
      });

      expect(onLeave).toHaveBeenCalledTimes(1);

      // Click behavior is replaced by custom onClick (which does nothing)
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(customOnClick).toHaveBeenCalledTimes(1);
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("context is updated between clicks when using custom onClick", async () => {
      const contexts: CitationBehaviorContext[] = [];
      const customOnClick = jest.fn((context: CitationBehaviorContext): CitationBehaviorActions => {
        contexts.push({ ...context });
        // Toggle image
        if (context.isImageExpanded) {
          return { setImageExpanded: false };
        } else {
          return { setImageExpanded: true };
        }
      });

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // First click - image not expanded yet
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(contexts[0].isImageExpanded).toBe(false);
      expect(document.querySelector("[role='dialog']")).toBeInTheDocument();

      // Second click - image should now be expanded
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(contexts[1].isImageExpanded).toBe(true);
      expect(document.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe("edge cases", () => {
    it("handles undefined behaviorConfig gracefully", async () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={undefined} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Should work with default behavior (first click shows popover, not image overlay)
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Popover should be shown
      await waitForPopoverVisible(container);
    });

    it("handles empty behaviorConfig object", async () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{}} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Should work with default behavior (first click shows popover, not image overlay)
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Popover should be shown
      await waitForPopoverVisible(container);
    });

    it("handles verification without image correctly in context", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithoutImage}
          behaviorConfig={{ onHover: { onEnter } }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });

      const context = onEnter.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.hasImage).toBe(false);
    });

    it("handles null verification correctly in context", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={null} behaviorConfig={{ onHover: { onEnter } }} />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });

      const context = onEnter.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.verification).toBeNull();
      expect(context.hasImage).toBe(false);
    });

    it("handles miss verification correctly", async () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={missVerification}
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      const context = customOnClick.mock.calls[0][0] as CitationBehaviorContext;
      expect(context.hasImage).toBe(false);
    });
  });

  // ==========================================================================
  // HIGHLIGHTED PHRASE - MISS BEHAVIOR TESTS
  // Tests for the isMiss prop added to prevent misleading highlighting
  // ==========================================================================

  describe("HighlightedPhrase - isMiss behavior", () => {
    it("should not highlight anchor text when citation is not found", async () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={missVerification} />);

      // Click to open popover
      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });

      // Wait for popover to open
      await waitForPopoverVisible(container);

      // For miss verification, popover shows minimal info - just verify no highlights exist anywhere
      const popoverContent = container.querySelector('[data-state="open"]');
      expect(popoverContent).toBeInTheDocument();

      // Ensure no highlight span with background color exists (ANCHOR_HIGHLIGHT_STYLE)
      const highlightedElements = popoverContent?.querySelectorAll("span[style*='background']");
      // Filter to only spans with backgroundColor (the highlight style)
      const actualHighlights = Array.from(highlightedElements || []).filter(el => {
        const style = (el as HTMLElement).style;
        return style.backgroundColor && style.backgroundColor !== "";
      });
      expect(actualHighlights.length).toBe(0);
    });

    it("should highlight anchor text when status is verified", async () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      // Click to open popover
      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });

      // Wait for popover to open
      await waitForPopoverVisible(container);

      // Check that popover is open
      const popoverContent = container.querySelector('[data-state="open"]');
      expect(popoverContent).toBeInTheDocument();

      // Check that highlight exists for verified citations
      // ANCHOR_HIGHLIGHT_STYLE uses backgroundColor with CSS var, borderRadius: 2px, padding: 0 1px
      // In the test environment, the backgroundColor may not render inline, so check for borderRadius + padding
      //
      // Note: We use document.querySelectorAll instead of container.querySelectorAll because:
      // 1. The popover content is rendered via portal (React.createPortal) at document body level
      // 2. The highlight may appear in either the trigger text or the popover (depending on component state)
      // 3. This test verifies the highlighting mechanism works, not its specific location
      // 4. The test environment is isolated (each test runs in clean DOM), so false positives are unlikely
      const highlightedElements = document.querySelectorAll("span[style*='border-radius']");
      const actualHighlights = Array.from(highlightedElements).filter(el => {
        const style = (el as HTMLElement).style;
        return style.borderRadius === "2px" && style.padding === "0px 1px";
      });

      // For verified status, we expect at least one highlighted span
      expect(actualHighlights.length).toBeGreaterThan(0);
    });

    it("should not highlight when anchorText is missing", async () => {
      const citationWithoutAnchor: Citation = {
        ...baseCitation,
        anchorText: undefined,
      };

      const { container } = render(
        <CitationComponent citation={citationWithoutAnchor} verification={verificationWithImage} />,
      );

      // Click to open popover
      const trigger = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(trigger as HTMLElement);
      });

      // Wait for popover to open
      await waitForPopoverVisible(container);

      // No highlighting should occur
      const popoverContent = container.querySelector('[data-state="open"]');
      const highlightedElements = popoverContent?.querySelectorAll("span[style*='background']");
      const actualHighlights = Array.from(highlightedElements || []).filter(el => {
        const style = (el as HTMLElement).style;
        return style.backgroundColor && style.backgroundColor !== "";
      });
      expect(actualHighlights.length).toBe(0);
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
    document: {
      verificationImageSrc: "data:image/png;base64,iVBORw0KGgo=",
    },
    verifiedMatchSnippet: "test citation phrase",
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
    it("auto-detects touch device when isMobile prop is not provided", async () => {
      mockTouchDevice(true);

      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toBeInTheDocument();

      // On touch devices, first tap should show popover, not open image overlay
      // Simulate touch sequence: touchStart then click
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // First tap should NOT open the full-screen image overlay
      // (popover behavior is handled by hover state, not dialog)
      // The key check is that image overlay dialog is NOT shown on first tap
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });

    it("does not auto-enable mobile mode on non-touch devices", async () => {
      mockTouchDevice(false);

      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const citation = container.querySelector("[data-citation-id]");

      // On non-touch devices, click should show popover (not image overlay)
      // as we now use lazy mode by default for all devices
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Should NOT open image overlay directly (lazy mode)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Should show popover instead
      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });
    });
  });

  describe("explicit isMobile prop overrides auto-detection", () => {
    it("isMobile={true} forces mobile behavior even on non-touch device", async () => {
      mockTouchDevice(false);

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Simulate touch sequence
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // First tap should NOT open image overlay (mobile behavior)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });

    it("isMobile={false} forces desktop behavior even on touch device", async () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={false} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click should show popover (lazy mode is now default for all devices)
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Should NOT open image overlay directly (lazy mode)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Should show popover instead
      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });
    });
  });

  describe("mobile tap sequence", () => {
    it("first tap shows popover, second tap closes popover", async () => {
      mockTouchDevice(true);

      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const citation = container.querySelector("[data-citation-id]");

      // First tap - should show popover (not image overlay)
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // Popover should be visible
      await waitForPopoverVisible(container);

      // Second tap - closes popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // Popover should be dismissed
      await waitForPopoverDismissed(container);
    });

    it("multiple taps toggle popover open/closed without opening image overlay", async () => {
      mockTouchDevice(true);

      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const citation = container.querySelector("[data-citation-id]");

      // First tap - show popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });
      await waitForPopoverVisible(container);

      // Second tap - close popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });
      await waitForPopoverDismissed(container);

      // Third tap - reopen popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });
      await waitForPopoverVisible(container);
    });

    it("mobile tap without verification image still shows popover on first tap", async () => {
      mockTouchDevice(true);

      const verificationNoImage: Verification = {
        status: "found",
        verifiedMatchSnippet: "Test match snippet",
      };

      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationNoImage} />);

      const citation = container.querySelector("[data-citation-id]");

      // First tap - should show popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // No image overlay (no image available)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Second tap - still no image overlay (no image available)
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });

    it("cross-citation tapping is not incorrectly debounced (each citation has its own timer)", async () => {
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
          <CitationComponent citation={citation1} verification={verificationWithImage} />
          <CitationComponent citation={citation2} verification={verificationWithImage} />
        </>,
      );

      const citations = container.querySelectorAll("[data-citation-id]");
      const citationA = citations[0];
      const citationB = citations[1];

      // Tap citation A
      await act(async () => {
        fireEvent.touchStart(citationA as HTMLElement);
        fireEvent.click(citationA as HTMLElement);
      });

      // Immediately tap citation B (within debounce window if it were global)
      // This should NOT be debounced because each citation has its own timer
      await act(async () => {
        fireEvent.touchStart(citationB as HTMLElement);
        fireEvent.click(citationB as HTMLElement);
      });

      // Both citations should have responded to their first tap
      // (no image overlay since it's first tap for each)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Now second tap on citation B should toggle details (proves citation B wasn't incorrectly debounced)
      await act(async () => {
        fireEvent.touchStart(citationB as HTMLElement);
        fireEvent.click(citationB as HTMLElement);
      });

      // No image overlay - second tap toggles details, not image
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });

    it("second tap toggles phrase expansion for miss citations (no image)", async () => {
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

      const { container } = render(<CitationComponent citation={missCitation} verification={missVerification} />);

      const citation = container.querySelector("[data-citation-id]");

      // First tap - show popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // No image overlay (it's a miss, no image)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Second tap - should toggle phrase expansion (not image overlay)
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // Still no image overlay (miss citation behavior toggles phrases, not image)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });

    it("custom behaviorConfig.onClick receives TouchEvent on mobile", async () => {
      mockTouchDevice(true);

      const onClickMock = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          behaviorConfig={{
            onClick: onClickMock,
          }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Tap on mobile
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.touchEnd(citation as HTMLElement);
      });

      // behaviorConfig.onClick should have been called
      expect(onClickMock).toHaveBeenCalledTimes(1);

      // The event should be a TouchEvent (check event.type)
      const [context, event] = onClickMock.mock.calls[0];
      expect(event.type).toBe("touchend");
      expect(context.citation).toEqual(baseCitation);
    });

    it("mobile with lazy mode - uses two-tap behavior, second tap toggles details", async () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // First tap - should show popover (mobile two-tap behavior)
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // No image overlay yet (first tap shows popover)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Second tap - should toggle details (not open image in lazy mode)
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // No image overlay - second tap toggles details, not image
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });
  });

  describe("mobile tap-outside dismiss", () => {
    it("tapping outside the popover dismisses it on mobile", async () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // First tap - should show popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // Popover should be visible
      await waitForPopoverVisible(container);

      // Tap outside (on document body) - should dismiss popover
      await act(async () => {
        fireEvent.touchStart(document.body);
      });

      // Popover should be dismissed
      await waitForPopoverDismissed(container);
    });

    it("tapping inside the popover content does NOT dismiss it", async () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // First tap - should show popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // Wait for popover to be visible
      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });

      // Find the popover content and tap inside it
      const popoverContent = container.querySelector('[data-state="open"]');
      await act(async () => {
        fireEvent.touchStart(popoverContent as HTMLElement);
      });

      // Popover should still be visible (not dismissed)
      await waitFor(() => {
        const popover = container.querySelector('[data-state="open"]');
        expect(popover).toBeInTheDocument();
      });
    });

    it("tapping the trigger while popover is open closes the popover", async () => {
      mockTouchDevice(true);

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // First tap - should show popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // Wait for popover to be visible
      await waitForPopoverVisible(container);

      // Second tap on trigger - should close the popover
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      // Popover should be dismissed
      await waitForPopoverDismissed(container);
    });

    it("desktop mode (isMobile=false) does not dismiss on outside click", async () => {
      mockTouchDevice(false);

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={false} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Click to show popover (lazy mode - click opens popover)
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Wait for popover to be visible
      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });

      // Touch outside - should NOT dismiss popover (desktop doesn't use touch dismiss)
      await act(async () => {
        fireEvent.touchStart(document.body);
      });

      // Give time for any state changes
      await new Promise(resolve => setTimeout(resolve, 50));

      // Popover should still be visible (desktop uses mouse leave, not touch)
      const popoverContent = container.querySelector('[data-state="open"]');
      expect(popoverContent).toBeInTheDocument();
    });

    it("listener cleanup - rapid open/close does not cause issues", async () => {
      mockTouchDevice(true);

      const { container, unmount } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true} />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Rapidly open and close popover multiple times
      for (let i = 0; i < 3; i++) {
        // Open popover
        await act(async () => {
          fireEvent.touchStart(citation as HTMLElement);
          fireEvent.click(citation as HTMLElement);
        });

        // Close by tapping outside
        await act(async () => {
          fireEvent.touchStart(document.body);
        });
      }

      // Final open
      await act(async () => {
        fireEvent.touchStart(citation as HTMLElement);
        fireEvent.click(citation as HTMLElement);
      });

      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });

      // Unmount should not cause errors (cleanup works correctly)
      expect(() => unmount()).not.toThrow();
    });
  });

  describe("keyboard accessibility", () => {
    it("Enter key shows popover first, second press toggles details", async () => {
      mockTouchDevice(false);

      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const citation = container.querySelector("[data-citation-id]");

      // First Enter - should show popover (not image)
      await act(async () => {
        fireEvent.keyDown(citation as HTMLElement, { key: "Enter" });
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Second Enter - toggles details (not image)
      await act(async () => {
        fireEvent.keyDown(citation as HTMLElement, { key: "Enter" });
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });

    it("Space key shows popover first, second press toggles details", async () => {
      mockTouchDevice(false);

      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const citation = container.querySelector("[data-citation-id]");

      // First Space - should show popover (not image)
      await act(async () => {
        fireEvent.keyDown(citation as HTMLElement, { key: " " });
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Second Space - toggles details (not image)
      await act(async () => {
        fireEvent.keyDown(citation as HTMLElement, { key: " " });
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });

    it("Enter key with deprecated interactionMode still uses lazy behavior", async () => {
      mockTouchDevice(false);

      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // First Enter - should show popover (not image)
      await act(async () => {
        fireEvent.keyDown(citation as HTMLElement, { key: "Enter" });
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Second Enter - toggles details (not image in lazy mode)
      await act(async () => {
        fireEvent.keyDown(citation as HTMLElement, { key: "Enter" });
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
    });

    it("citation has correct ARIA attributes", () => {
      mockTouchDevice(false);

      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

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
      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

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
    document: {
      verificationImageSrc: "data:image/png;base64,iVBORw0KGgo=",
    },
    verifiedMatchSnippet: "test citation phrase",
    status: "found",
  };

  const verificationWithoutImage: Verification = {
    verifiedMatchSnippet: "test citation phrase",
    status: "found",
  };

  describe("deprecated eager mode (now uses lazy behavior)", () => {
    it("does NOT show popover on hover (deprecated eager mode uses lazy behavior)", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="eager"
          behaviorConfig={{ onHover: { onEnter } }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });

      // onEnter callback should still fire
      expect(onEnter).toHaveBeenCalledTimes(1);

      // Give time for popover to appear if it would
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Popover should NOT appear on hover (lazy behavior)
      const popoverContent = container.querySelector('[data-state="open"]');
      expect(popoverContent).not.toBeInTheDocument();
    });

    it("shows popover on first click (deprecated eager mode uses lazy behavior)", async () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="eager" />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // First click should show popover, NOT image overlay (lazy behavior)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Popover should be shown
      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });
    });

    it("has cursor-pointer class (not cursor-zoom-in) even with image available", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="eager" />,
      );

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toHaveClass("cursor-pointer");
    });

    it("has cursor-pointer class when no image is available", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithoutImage} interactionMode="eager" />,
      );

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toHaveClass("cursor-pointer");
    });

    it("default behavior (no interactionMode) uses lazy mode", async () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const citation = container.querySelector("[data-citation-id]");

      // Click should show popover, not image directly (lazy mode is default)
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Popover should be shown
      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });
    });
  });

  describe("lazy mode", () => {
    it("does NOT show popover on hover", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="lazy"
          behaviorConfig={{ onHover: { onEnter } }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });

      // In lazy mode, onEnter callback still fires but popover doesn't open
      expect(onEnter).toHaveBeenCalledTimes(1);

      // Give time for popover to appear if it would
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Popover should NOT appear on hover in lazy mode
      const popoverContent = container.querySelector('[data-state="open"]');
      expect(popoverContent).not.toBeInTheDocument();
    });

    it("shows popover on first click (not image overlay)", async () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // First click should NOT open image overlay
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Popover should be shown instead (hover state activated via click)
      await waitFor(() => {
        const popoverContent = container.querySelector('[data-state="open"]');
        expect(popoverContent).toBeInTheDocument();
      });
    });

    it("closes popover on second click", async () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // First click - shows popover
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      await waitForPopoverVisible(container);

      // Second click - closes popover
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      await waitForPopoverDismissed(container);
    });

    it("has cursor-pointer class initially (before popover is shown)", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" />,
      );

      const citation = container.querySelector("[data-citation-id]");
      expect(citation).toHaveClass("cursor-pointer");
    });

    it("stays cursor-pointer after first click (lazy mode doesn't zoom)", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Initially cursor-pointer
      expect(citation).toHaveClass("cursor-pointer");

      // First click - shows popover
      fireEvent.click(citation as HTMLElement);

      // In lazy mode, cursor stays as pointer (not zoom-in)
      expect(citation).toHaveClass("cursor-pointer");
    });

    it("stays cursor-pointer throughout interactions in lazy mode", () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Initially cursor-pointer
      expect(citation).toHaveClass("cursor-pointer");

      // First click - shows popover
      fireEvent.click(citation as HTMLElement);
      expect(citation).toHaveClass("cursor-pointer");

      // Second click - closes popover
      fireEvent.click(citation as HTMLElement);
      expect(citation).toHaveClass("cursor-pointer");
    });

    it("still triggers eventHandlers.onClick on both clicks", async () => {
      const onClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="lazy"
          eventHandlers={{ onClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // First click
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(onClick).toHaveBeenCalledTimes(1);

      // Second click
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("works correctly without image (no zoom needed)", async () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithoutImage} interactionMode="lazy" />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // First click - activates hover state (would show popover)
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Image overlay should NOT open (no image available)
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Second click - still no image to zoom
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });
      expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();

      // Cursor should remain pointer (no image to zoom)
      expect(citation).toHaveClass("cursor-pointer");
    });

    it("applies hover styles but not popover on hover", async () => {
      const { container } = render(
        <CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" />,
      );

      const citation = container.querySelector("[data-citation-id]");

      // Hover should apply visual styles but not show popover
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });

      // The citation element should still be interactable
      expect(citation).toBeInTheDocument();

      // Give time for popover to appear if it would
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // But popover should NOT appear in lazy mode on hover
      const popoverContent = container.querySelector('[data-state="open"]');
      expect(popoverContent).not.toBeInTheDocument();
    });
  });

  describe("interactionMode with behaviorConfig", () => {
    it("custom onClick overrides lazy mode behavior", async () => {
      const customOnClick = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="lazy"
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Custom onClick should be called instead of lazy mode default
      expect(customOnClick).toHaveBeenCalledTimes(1);

      // Neither popover nor image overlay should open (custom handler takes over)
      expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
    });

    it("custom onClick returning actions works in lazy mode", async () => {
      const customOnClick = jest.fn(
        (): CitationBehaviorActions => ({
          setImageExpanded: true,
        }),
      );

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="lazy"
          behaviorConfig={{ onClick: customOnClick }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.click(citation as HTMLElement);
      });

      // Custom action should open image directly (bypassing lazy mode)
      expect(document.querySelector("[role='dialog']")).toBeInTheDocument();
    });

    it("onHover callbacks still work in lazy mode", async () => {
      const onEnter = jest.fn();

      const { container } = render(
        <CitationComponent
          citation={baseCitation}
          verification={verificationWithImage}
          interactionMode="lazy"
          behaviorConfig={{ onHover: { onEnter } }}
        />,
      );

      const citation = container.querySelector("[data-citation-id]");
      await act(async () => {
        fireEvent.mouseEnter(citation as HTMLElement);
      });

      // onEnter callback should still fire
      expect(onEnter).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // DESKTOP CLICK-OUTSIDE DISMISS TESTS
  // Tests for the desktop mousedown click-outside handler
  // ==========================================================================

  describe("desktop click-outside dismiss", () => {
    // Mock desktop environment for all tests in this suite
    beforeEach(() => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === "(pointer: fine)", // Desktop
          media: query,
          onchange: null,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });
    });

    it("dismisses popover when clicking outside on desktop", async () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const trigger = container.querySelector("[data-citation-id]") as HTMLElement;

      // Click to open popover
      await act(async () => {
        fireEvent.click(trigger);
      });

      await waitForPopoverVisible(container);

      // Click outside (on document body)
      await act(async () => {
        fireEvent.mouseDown(document.body);
      });

      // Popover should close immediately (no delay)
      await waitForPopoverDismissed(container);
    });

    it("does not dismiss when clicking inside trigger", async () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const trigger = container.querySelector("[data-citation-id]") as HTMLElement;

      // Click to open popover
      await act(async () => {
        fireEvent.click(trigger);
      });

      await waitForPopoverVisible(container);

      // Click on the trigger again (handled by click handler, not outside dismiss)
      await act(async () => {
        fireEvent.mouseDown(trigger);
      });

      // Popover should still be open
      expect(container.querySelector('[data-state="open"]')).toBeInTheDocument();
    });

    it("does not dismiss when clicking inside popover content", async () => {
      const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} />);

      const trigger = container.querySelector("[data-citation-id]") as HTMLElement;

      // Click to open popover
      await act(async () => {
        fireEvent.click(trigger);
      });

      await waitForPopoverVisible(container);

      const popoverContent = container.querySelector('[data-state="open"]') as HTMLElement;

      // Click inside popover content
      await act(async () => {
        fireEvent.mouseDown(popoverContent);
      });

      // Popover should still be open
      expect(container.querySelector('[data-state="open"]')).toBeInTheDocument();
    });

    // Note: Testing the image overlay protection is complex due to interaction modes.
    // The handler checks isAnyOverlayOpenRef which is set by the CitationOverlayContext.
    // This is covered by integration tests and visual testing.
  });
});

// =============================================================================
// PROOF URL LINK TESTS
// =============================================================================

describe("CitationComponent proof URL links", () => {
  afterEach(() => {
    cleanup();
  });

  const baseCitation: Citation = {
    type: "document",
    attachmentId: "abc123",
    citationNumber: 1,
    pageNumber: 5,
    anchorText: "test citation",
    fullPhrase: "This is a test citation phrase",
  };

  it("renders static text when proof URL is not available", async () => {
    const verification: Verification = {
      status: "found",
      label: "Document.pdf",
      verifiedMatchSnippet: "test citation phrase",
      document: { verifiedPageNumber: 5 },
    };

    const { container } = render(<CitationComponent citation={baseCitation} verification={verification} />);

    // Click to open popover
    const trigger = container.querySelector("[data-citation-id]");
    await act(async () => {
      fireEvent.click(trigger as HTMLElement);
    });

    await waitForPopoverVisible(container);

    // Should not have any links in the popover
    const links = container.querySelectorAll("a");
    const proofLinks = Array.from(links).filter(link => link.textContent?.includes("Page 5"));
    expect(proofLinks.length).toBe(0);
  });

  it("does not render link for unsafe proof URL (javascript: protocol)", async () => {
    const verification: Verification = {
      status: "found",
      label: "Document.pdf",
      verifiedMatchSnippet: "test citation phrase",
      document: { verifiedPageNumber: 5 },
      proof: { proofUrl: "javascript:alert('XSS')" },
    };

    const { container } = render(<CitationComponent citation={baseCitation} verification={verification} />);

    // Click to open popover
    const trigger = container.querySelector("[data-citation-id]");
    await act(async () => {
      fireEvent.click(trigger as HTMLElement);
    });

    await waitForPopoverVisible(container);

    // Should not have any javascript: protocol links
    const links = container.querySelectorAll("a");
    // This test checks that our security code (sanitizeUrl) blocks javascript: URLs.
    // Production code uses whitelist approach (http/https only) which blocks ALL dangerous protocols.
    const javascriptLinks = Array.from(links).filter(link => link.getAttribute("href")?.startsWith("javascript:")); // codeql[js/incomplete-url-scheme-check]
    expect(javascriptLinks.length).toBe(0);
  });

  it("does not render link for unsafe proof URL (data: protocol)", async () => {
    const verification: Verification = {
      status: "found",
      label: "Document.pdf",
      verifiedMatchSnippet: "test citation phrase",
      document: { verifiedPageNumber: 5 },
      proof: { proofUrl: "data:text/html,<script>alert('XSS')</script>" },
    };

    const { container } = render(<CitationComponent citation={baseCitation} verification={verification} />);

    // Click to open popover
    const trigger = container.querySelector("[data-citation-id]");
    await act(async () => {
      fireEvent.click(trigger as HTMLElement);
    });

    await waitForPopoverVisible(container);

    // Should not have any data: protocol links
    const links = container.querySelectorAll("a");
    const dataLinks = Array.from(links).filter(link => link.getAttribute("href")?.startsWith("data:"));
    expect(dataLinks.length).toBe(0);
  });

  it("blocks proof URL from untrusted domain", async () => {
    const verification: Verification = {
      status: "found",
      label: "Document.pdf",
      verifiedMatchSnippet: "test citation phrase",
      document: { verifiedPageNumber: 5 },
      proof: { proofUrl: "https://evil.com/fake-proof" },
    };

    const { container } = render(<CitationComponent citation={baseCitation} verification={verification} />);

    // Click to open popover
    const trigger = container.querySelector("[data-citation-id]");
    await act(async () => {
      fireEvent.click(trigger as HTMLElement);
    });

    await waitForPopoverVisible(container);

    // Should not have any links with evil.com
    const links = container.querySelectorAll("a");
    // This test checks that our security code (isApprovedDomain) blocks untrusted domains.
    // Production code uses proper URL parsing and domain validation, not substring matching.
    const evilLinks = Array.from(links).filter(link => link.getAttribute("href")?.includes("evil.com")); // codeql[js/incomplete-url-substring-sanitization]
    expect(evilLinks.length).toBe(0);
  });
});
