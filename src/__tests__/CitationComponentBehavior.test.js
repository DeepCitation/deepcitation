import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
mock.module("react-dom", () => {
    const actual = require("react-dom");
    return { ...actual, createPortal: (node) => node };
});
import { CitationComponent } from "../react/Citation";
import { HighlightedSourceContext } from "../react/HighlightedSourceContext";
// Helper to wait for popover to become visible
const waitForPopoverVisible = async (container) => {
    await act(async () => {
        await waitFor(() => {
            const popover = container.querySelector('[data-state="open"]');
            expect(popover).toBeInTheDocument();
        });
    });
};
// Helper to wait for popover to be dismissed
const waitForPopoverDismissed = async (container) => {
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
    const baseCitation = {
        citationNumber: 1,
        sourceMatch: "test citation",
        sourceContext: "This is a test citation phrase",
    };
    const verificationWithImage = {
        evidence: {
            src: "data:image/png;base64,iVBORw0KGgo=",
        },
        sourceSnippet: "test citation phrase",
        status: "found",
    };
    const verificationWithoutImage = {
        sourceSnippet: "test citation phrase",
        status: "found",
    };
    const missVerification = {
        sourceSnippet: "",
        status: "not_found",
    };
    const pendingVerification = {
        status: "pending",
    };
    // ==========================================================================
    // STATUS DERIVATION TESTS
    // Status is derived from verification.status
    // ==========================================================================
    describe("status derivation from verification", () => {
        it("shows spinner for pending status", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={pendingVerification}/>);
            // Should have a spinner (svg with animate-spin class)
            const spinner = container.querySelector("[data-dc-indicator='pending']");
            expect(spinner).toBeInTheDocument();
        });
        it("does not show spinner when verification is null (use isLoading prop)", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={null}/>);
            // Should NOT have a spinner by default - use isLoading prop to show spinner
            const spinner = container.querySelector("[data-dc-indicator='pending']");
            expect(spinner).not.toBeInTheDocument();
        });
        it("does not show spinner when verification has no status (use isLoading prop)", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={{}}/>);
            // Should NOT have a spinner by default - use isLoading prop to show spinner
            const spinner = container.querySelector("[data-dc-indicator='pending']");
            expect(spinner).not.toBeInTheDocument();
        });
        it("shows spinner when isLoading prop is true", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={null} isLoading={true}/>);
            // Should have a spinner when isLoading is true
            const spinner = container.querySelector("[data-dc-indicator='pending']");
            expect(spinner).toBeInTheDocument();
        });
        it("does NOT show spinner with isLoading when verification has definitive status", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage} isLoading={true}/>);
            // A definitive verification status should override isLoading
            // This prevents stuck spinners when we already have a result
            const spinner = container.querySelector("[data-dc-indicator='pending']");
            expect(spinner).not.toBeInTheDocument();
            // Should show the verified indicator instead
            const greenCheck = container.querySelector("[data-dc-indicator='verified']");
            expect(greenCheck).toBeInTheDocument();
        });
        it("shows check icon for found status", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage}/>);
            // Should NOT have a spinner
            const spinner = container.querySelector("[data-dc-indicator='pending']");
            expect(spinner).not.toBeInTheDocument();
            // Should have verified indicator
            const greenCheck = container.querySelector("[data-dc-indicator='verified']");
            expect(greenCheck).toBeInTheDocument();
        });
        it("shows X circle icon for not_found status", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={missVerification}/>);
            // Should NOT have a spinner
            const spinner = container.querySelector("[data-dc-indicator='pending']");
            expect(spinner).not.toBeInTheDocument();
            // Should have error indicator
            const redXIcon = container.querySelector("[data-dc-indicator='error']");
            expect(redXIcon).toBeInTheDocument();
        });
        it("shows amber check for partial match status", () => {
            const partialVerification = {
                sourceSnippet: "partial text",
                status: "found_on_other_page",
            };
            const { container } = render(<CitationComponent citation={baseCitation} verification={partialVerification}/>);
            // Should have partial match indicator
            const amberCheck = container.querySelector("[data-dc-indicator='partial']");
            expect(amberCheck).toBeInTheDocument();
        });
        it("shows amber check for found status with low-confidence ambiguity", () => {
            const ambiguousVerification = {
                sourceSnippet: "test citation phrase",
                status: "found",
                ambiguity: {
                    totalOccurrences: 10,
                    occurrencesOnExpectedPage: 10,
                    confidence: "low",
                    note: "10 citations with distinct sourceMatch values resolved to the same passage",
                },
            };
            const { container } = render(<CitationComponent citation={baseCitation} verification={ambiguousVerification}/>);
            expect(container.querySelector("[data-dc-indicator='partial']")).toBeInTheDocument();
            expect(container.querySelector("[data-dc-indicator='verified']")).not.toBeInTheDocument();
        });
    });
    // ==========================================================================
    // INDICATOR VARIANT "none" TESTS
    // ==========================================================================
    describe('indicatorVariant="none"', () => {
        it("shows indicator by default (indicatorVariant=icon)", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage}/>);
            // Should have verified indicator
            const greenCheck = container.querySelector("[data-dc-indicator='verified']");
            expect(greenCheck).toBeInTheDocument();
        });
        it('hides indicator when indicatorVariant="none"', () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage} indicatorVariant="none"/>);
            // Should NOT have any status indicators
            const greenCheck = container.querySelector("[data-dc-indicator='verified']");
            const amberCheck = container.querySelector("[data-dc-indicator='partial']");
            const spinner = container.querySelector("[data-dc-indicator='pending']");
            expect(greenCheck).not.toBeInTheDocument();
            expect(amberCheck).not.toBeInTheDocument();
            expect(spinner).not.toBeInTheDocument();
        });
        it('hides spinner when indicatorVariant="none" and isPending', () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={pendingVerification} indicatorVariant="none"/>);
            // Should NOT have spinner
            const spinner = container.querySelector(".animate-spin");
            expect(spinner).not.toBeInTheDocument();
        });
        it('custom renderIndicator takes precedence over indicatorVariant="none"', () => {
            const customIndicator = <span data-testid="custom-indicator">Custom</span>;
            const { container, getByTestId } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage} variant="brackets" indicatorVariant="none" renderIndicator={() => customIndicator}/>);
            // Custom indicator should still be rendered
            expect(getByTestId("custom-indicator")).toBeInTheDocument();
            // Default verified indicator should NOT be rendered
            const greenCheck = container.querySelector("[data-dc-indicator='verified']");
            expect(greenCheck).not.toBeInTheDocument();
        });
        it('hides X circle indicator for not_found when indicatorVariant="none"', () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={missVerification} variant="brackets" indicatorVariant="none"/>);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            expect(citation).toBeInTheDocument();
            // First click should show popover, NOT image overlay
            await act(async () => {
                fireEvent.click(citation);
            });
            // Image overlay should NOT be visible (first click shows popover)
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Popover should be shown
            await waitForPopoverVisible(container);
        });
        it("renders the built-in claimed-as marker when claimText differs from sourceMatch", async () => {
            const citation = {
                citationNumber: 28,
                sourceMatch: "assessed for ADHD",
                sourceContext: "She was assessed for ADHD but received no formal diagnosis.",
            };
            const verification = {
                sourceSnippet: "She was assessed for ADHD but received no formal diagnosis.",
                status: "found",
            };
            const { container, getByText } = render(<CitationComponent citation={citation} verification={verification} claimText="age 13"/>);
            const trigger = container.querySelector("[data-citation-id]");
            expect(trigger).toBeInTheDocument();
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            expect(getByText(/Claimed as.*age 13/i)).toBeInTheDocument();
            expect(getByText(/assessed for ADHD/i)).toBeInTheDocument();
        });
        it("does not render the claimed-as marker when claimText differs only by dash variant", async () => {
            const citation = {
                citationNumber: 29,
                sourceMatch: "Section 8 - Prognosis",
                sourceContext: "Section 8 - Prognosis 1. Duration of the medical condition(s) is likely to be:",
            };
            const verification = {
                sourceSnippet: "Section 8 - Prognosis 1. Duration of the medical condition(s) is likely to be:",
                status: "found",
            };
            const { container, queryByText } = render(<CitationComponent citation={citation} verification={verification} claimText="Section 8 — Prognosis"/>);
            const trigger = container.querySelector("[data-citation-id]");
            expect(trigger).toBeInTheDocument();
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            expect(queryByText(/Claimed as.*Section 8/i)).not.toBeInTheDocument();
        });
        it("does not render the claimed-as marker when claimText is a dash-equivalent prefix of sourceContext", async () => {
            const citation = {
                citationNumber: 30,
                sourceMatch: "Relationship with Applicant",
                sourceContext: "Section 2 - Relationship with Applicant 1. Are you the: Physician Specialist",
            };
            const verification = {
                sourceSnippet: "Section 2 - Relationship with Applicant 1. Are you the: Physician Specialist",
                status: "found",
            };
            const { container, queryByText } = render(<CitationComponent citation={citation} verification={verification} claimText="Section 2 — Relationship with Applicant"/>);
            const trigger = container.querySelector("[data-citation-id]");
            expect(trigger).toBeInTheDocument();
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            expect(queryByText(/Claimed as.*Section 2/i)).not.toBeInTheDocument();
        });
        it("shows a popover for source-backed citations without a verification record", async () => {
            const citation = {
                citationNumber: 133,
                sourceMatch: "2021",
                sourceContext: "Physio for a few months in 2021",
            };
            const { container, getByText } = render(<CitationComponent citation={citation} verification={null} claimText="years ago"/>);
            const trigger = container.querySelector("[data-citation-id]");
            expect(trigger).toBeInTheDocument();
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            expect(getByText(/Claimed as.*years ago/i)).toBeInTheDocument();
            expect(getByText(/2021/i)).toBeInTheDocument();
        });
        it("keeps the source match visible in pending source-backed popovers when context omits it", async () => {
            const citation = {
                citationNumber: 71,
                sourceMatch: "18",
                sourceContext: "PHQ9 Total Score 3",
            };
            const { container, getByText } = render(<CitationComponent citation={citation} verification={null}/>);
            const trigger = container.querySelector("[data-citation-id]");
            expect(trigger).toBeInTheDocument();
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            expect(getByText(/PHQ9 Total Score 3/)).toBeInTheDocument();
            expect(getByText("18")).toBeInTheDocument();
        });
        it("closes popover on second click", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First click - shows popover
            await act(async () => {
                fireEvent.click(citation);
            });
            await waitForPopoverVisible(container);
            // Second click - closes popover
            await act(async () => {
                fireEvent.click(citation);
            });
            await waitForPopoverDismissed(container);
        });
        it("closes the first popover when a second citation opens", async () => {
            const secondCitation = {
                citationNumber: 2,
                sourceMatch: "second citation",
                sourceContext: "This is another test citation phrase",
            };
            const { container } = render(<>
          <CitationComponent citation={baseCitation} verification={verificationWithImage}/>
          <CitationComponent citation={secondCitation} verification={verificationWithImage}/>
        </>);
            const citations = container.querySelectorAll("[data-citation-id]");
            expect(citations).toHaveLength(2);
            await act(async () => {
                fireEvent.click(citations[0]);
            });
            await waitFor(() => {
                expect(container.querySelectorAll('[data-state="open"]')).toHaveLength(1);
            });
            await act(async () => {
                fireEvent.click(citations[1]);
            });
            await waitFor(() => {
                expect(container.querySelectorAll('[data-state="open"]')).toHaveLength(1);
            });
            expect(citations[0]).toHaveAttribute("aria-expanded", "false");
            expect(citations[1]).toHaveAttribute("aria-expanded", "true");
        });
        it("does not open image overlay on click when no image is available", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Click should not open overlay (no image)
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
        it("always calls eventHandlers.onClick", async () => {
            const onClick = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} eventHandlers={{ onClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
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
            const customOnClick = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Click should not open image (onClick replaces default behavior)
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
            expect(customOnClick).toHaveBeenCalledTimes(1);
        });
        it("prevents image from opening when onClick returns false", async () => {
            const customOnClick = mock(() => false);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Multiple clicks should not show image overlay
            await act(async () => {
                fireEvent.click(citation);
                fireEvent.click(citation);
                fireEvent.click(citation);
            });
            expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
            expect(customOnClick).toHaveBeenCalledTimes(3);
        });
        it("still calls eventHandlers.onClick when onClick is provided", async () => {
            const eventHandlerOnClick = mock(() => { });
            const customOnClick = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }} eventHandlers={{ onClick: eventHandlerOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
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
            const customOnClick = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(customOnClick).toHaveBeenCalledTimes(1);
            const context = customOnClick.mock.calls[0][0];
            expect(context.citation).toEqual(baseCitation);
            expect(context.citationKey).toBeDefined();
            expect(context.verification).toEqual(verificationWithImage);
            expect(context.isTooltipExpanded).toBe(false); // Not hovering
            expect(context.isImageExpanded).toBe(false);
            expect(context.hasImage).toBe(true);
        });
        it("replaces default behavior when returning void", async () => {
            const customOnClick = mock(() => {
                // Return nothing - no state changes
            });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Custom handler was called
            expect(customOnClick).toHaveBeenCalledTimes(1);
            // No state changes occurred (onClick replaces defaults)
            expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
        });
        it("prevents any state changes when returning false", async () => {
            const customOnClick = mock(() => false);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Custom handler was called
            expect(customOnClick).toHaveBeenCalledTimes(1);
            // Default behavior should NOT have occurred
            expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
        });
        it("applies returned actions to open image", async () => {
            const customOnClick = mock(() => ({
                setImageExpanded: true,
            }));
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Custom action: portal overlay renders in expanded-page state (no role="dialog" on portal div)
            // SourceContextHeader's PagePill renders in close mode with this title
            expect(document.querySelector("button[title='Close expanded view (Esc)']")).toBeInTheDocument();
            await act(async () => {
                await new Promise(resolve => setTimeout(resolve, 140));
            });
            // CitationComponent sets overflowX/overflowY: "hidden" (longhand) on the popover dialog
            // for expanded-page state to avoid React shorthand/longhand conflict with Popover's overflowX.
            expect(document.querySelector("[role='dialog']")?.style.overflowX).toBe("hidden");
        });
        it("can apply setImageExpanded with string src", async () => {
            const customImageSrc = "data:image/png;base64,customImage";
            const customOnClick = mock(() => ({
                setImageExpanded: customImageSrc,
            }));
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Triple-render pattern: expanded-keyhole and expanded-page InlineExpandedImage
            // both exist in the DOM; the expanded-page instance (with override src) renders last.
            const allImages = document.querySelectorAll("img[alt='Verification evidence']");
            const overlayImage = allImages[allImages.length - 1];
            expect(overlayImage).toBeInTheDocument();
            expect(overlayImage?.getAttribute("src")).toBe(customImageSrc);
        });
        it("rejects setImageExpanded string with javascript: URI (does not update src)", async () => {
            const customOnClick = mock(() => ({
                setImageExpanded: "javascript:alert(1)",
            }));
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Expanded-page portal opens (setImageExpanded: true path) but custom src is rejected;
            // falls back to the baseline evidence src, not the malicious URI
            const overlayImage = document.querySelector("img[alt='Full page verification']");
            expect(overlayImage?.getAttribute("src")).not.toBe("javascript:alert(1)");
        });
        it("rejects setImageExpanded string with SVG data URI", async () => {
            const svgUri = "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=";
            const customOnClick = mock(() => ({ setImageExpanded: svgUri }));
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            const overlayImage = document.querySelector("img[alt='Full page verification']");
            expect(overlayImage?.getAttribute("src")).not.toBe(svgUri);
        });
        it("accepts setImageExpanded with trusted CDN URL", async () => {
            const trustedSrc = "https://cdn.deepcitation.com/proof/page1.avif";
            const customOnClick = mock(() => ({ setImageExpanded: trustedSrc }));
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Triple-render pattern: pick the expanded-page instance (last match).
            const allImages = document.querySelectorAll("img[alt='Verification evidence']");
            const overlayImage = allImages[allImages.length - 1];
            expect(overlayImage).toBeInTheDocument();
            expect(overlayImage?.getAttribute("src")).toBe(trustedSrc);
        });
        it("can close image with setImageExpanded: false", async () => {
            // Use custom onClick to explicitly open image (since default behavior is lazy mode)
            const customOnClick = mock(() => ({
                setImageExpanded: true,
            }));
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Click to open image via custom onClick
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(document.querySelector("[role='dialog']")).toBeInTheDocument();
            // Click overlay to close (clicking the dialog backdrop itself triggers dismissal)
            const overlay = document.querySelector("[role='dialog']");
            await act(async () => {
                fireEvent.click(overlay);
            });
            // The popover uses an 80ms exit animation delay before unmounting.
            // Check data-state rather than DOM presence to avoid happy-dom stale-ref quirks.
            expect(document.querySelector("[role='dialog'][data-state='open']")).toBeNull();
        });
        it("still calls eventHandlers.onClick when custom handler returns actions", async () => {
            const eventHandlerOnClick = mock(() => { });
            const customOnClick = mock(() => ({
                setImageExpanded: true,
            }));
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }} eventHandlers={{ onClick: eventHandlerOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(customOnClick).toHaveBeenCalledTimes(1);
            expect(eventHandlerOnClick).toHaveBeenCalledTimes(1);
        });
        it("still calls eventHandlers.onClick when custom handler returns false", async () => {
            const eventHandlerOnClick = mock(() => { });
            const customOnClick = mock(() => false);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }} eventHandlers={{ onClick: eventHandlerOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
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
            const trackingData = [];
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} eventHandlers={{
                    onClick: (_citation, citationKey) => {
                        trackingData.push(`clicked:${citationKey}`);
                    },
                }}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Click - analytics tracked but default behavior is disabled
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(trackingData).toHaveLength(1);
            // Default behavior (image opening) should NOT happen
            expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
        });
        it("eventHandlers.onClick runs even when behaviorConfig.onClick is provided", async () => {
            const eventHandlerCalls = [];
            const behaviorConfigCalls = [];
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{
                    onClick: _context => {
                        behaviorConfigCalls.push("behavior");
                        return { setImageExpanded: true };
                    },
                }} eventHandlers={{
                    onClick: () => {
                        eventHandlerCalls.push("event");
                    },
                }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Both handlers were called
            expect(behaviorConfigCalls).toHaveLength(1);
            expect(eventHandlerCalls).toHaveLength(1);
        });
    });
    describe("eventHandlers.onClickAfterDefault", () => {
        it("runs after default click behavior and keeps popover interactions", async () => {
            const onClickAfterDefault = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} eventHandlers={{ onClickAfterDefault }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            await waitForPopoverVisible(container);
            expect(onClickAfterDefault).toHaveBeenCalledTimes(1);
            expect(onClickAfterDefault).toHaveBeenCalledWith(baseCitation, expect.any(String), expect.any(Object));
        });
        it("does not run when click behavior is replaced by eventHandlers.onClick", async () => {
            const onClick = mock(() => { });
            const onClickAfterDefault = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} eventHandlers={{ onClick, onClickAfterDefault }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(onClick).toHaveBeenCalledTimes(1);
            expect(onClickAfterDefault).not.toHaveBeenCalled();
        });
        it("does not run when click behavior is replaced by behaviorConfig.onClick", async () => {
            const customOnClick = mock(() => { });
            const onClickAfterDefault = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }} eventHandlers={{ onClickAfterDefault }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(customOnClick).toHaveBeenCalledTimes(1);
            expect(onClickAfterDefault).not.toHaveBeenCalled();
        });
    });
    // ==========================================================================
    // CUSTOM onHover HANDLER TESTS
    // ==========================================================================
    describe("custom onHover handlers", () => {
        it("calls onHover.onEnter on mouse enter", async () => {
            const onEnter = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onHover: { onEnter } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseEnter(citation);
            });
            expect(onEnter).toHaveBeenCalledTimes(1);
        });
        it("calls onHover.onLeave on mouse leave", async () => {
            const onLeave = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onHover: { onLeave } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseLeave(citation);
            });
            expect(onLeave).toHaveBeenCalledTimes(1);
        });
        it("provides correct context to onHover.onEnter", async () => {
            const onEnter = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onHover: { onEnter } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseEnter(citation);
            });
            const context = onEnter.mock.calls[0][0];
            expect(context.citation).toEqual(baseCitation);
            expect(context.citationKey).toBeDefined();
            expect(context.verification).toEqual(verificationWithImage);
            expect(context.hasImage).toBe(true);
        });
        it("provides correct context to onHover.onLeave", async () => {
            const onLeave = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onHover: { onLeave } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseLeave(citation);
            });
            const context = onLeave.mock.calls[0][0];
            expect(context.citation).toEqual(baseCitation);
            expect(context.hasImage).toBe(true);
        });
        it("still calls eventHandlers.onMouseEnter", async () => {
            const behaviorOnEnter = mock(() => { });
            const eventHandlerOnEnter = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onHover: { onEnter: behaviorOnEnter } }} eventHandlers={{ onMouseEnter: eventHandlerOnEnter }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseEnter(citation);
            });
            expect(behaviorOnEnter).toHaveBeenCalledTimes(1);
            expect(eventHandlerOnEnter).toHaveBeenCalledTimes(1);
        });
        it("still calls eventHandlers.onMouseLeave", async () => {
            const behaviorOnLeave = mock(() => { });
            const eventHandlerOnLeave = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onHover: { onLeave: behaviorOnLeave } }} eventHandlers={{ onMouseLeave: eventHandlerOnLeave }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseLeave(citation);
            });
            expect(behaviorOnLeave).toHaveBeenCalledTimes(1);
            expect(eventHandlerOnLeave).toHaveBeenCalledTimes(1);
        });
        it("works with only onEnter provided", async () => {
            const onEnter = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onHover: { onEnter } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Should not throw when leaving without onLeave handler
            await act(async () => {
                fireEvent.mouseEnter(citation);
                fireEvent.mouseLeave(citation);
            });
            expect(onEnter).toHaveBeenCalledTimes(1);
        });
        it("works with only onLeave provided", async () => {
            const onLeave = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onHover: { onLeave } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Should not throw when entering without onEnter handler
            await act(async () => {
                fireEvent.mouseEnter(citation);
                fireEvent.mouseLeave(citation);
            });
            expect(onLeave).toHaveBeenCalledTimes(1);
        });
    });
    // ==========================================================================
    // COMBINED CONFIGURATION TESTS
    // ==========================================================================
    describe("combined configurations", () => {
        it("custom onClick returning actions applies them", async () => {
            const customOnClick = mock(() => ({
                setImageExpanded: true,
            }));
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{
                    onClick: customOnClick,
                }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Custom action was applied
            expect(document.querySelector("[role='dialog']")).toBeInTheDocument();
        });
        it("onHover works independently of click configuration", async () => {
            const onEnter = mock(() => { });
            const onLeave = mock(() => { });
            const customOnClick = mock(() => { }); // onClick provided, so default click behavior is replaced
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{
                    onClick: customOnClick,
                    onHover: { onEnter, onLeave },
                }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseEnter(citation);
            });
            expect(onEnter).toHaveBeenCalledTimes(1);
            await act(async () => {
                fireEvent.mouseLeave(citation);
            });
            expect(onLeave).toHaveBeenCalledTimes(1);
            // Click behavior is replaced by custom onClick (which does nothing)
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(customOnClick).toHaveBeenCalledTimes(1);
            expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
        });
        it("context is updated between clicks when using custom onClick", async () => {
            const contexts = [];
            const customOnClick = mock((context) => {
                contexts.push({ ...context });
                // Toggle image
                if (context.isImageExpanded) {
                    return { setImageExpanded: false };
                }
                else {
                    return { setImageExpanded: true };
                }
            });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First click - image not expanded yet
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(contexts[0].isImageExpanded).toBe(false);
            expect(document.querySelector("[role='dialog']")).toBeInTheDocument();
            // Second click - image should now be expanded
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(contexts[1].isImageExpanded).toBe(true);
            // The popover uses an 80ms exit animation delay before unmounting.
            // Check data-state rather than DOM presence to avoid happy-dom stale-ref quirks.
            expect(document.querySelector("[role='dialog'][data-state='open']")).toBeNull();
        });
    });
    // ==========================================================================
    // EDGE CASES
    // ==========================================================================
    describe("edge cases", () => {
        it("handles undefined behaviorConfig gracefully", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={undefined}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Should work with default behavior (first click shows popover, not image overlay)
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Popover should be shown
            await waitForPopoverVisible(container);
        });
        it("handles empty behaviorConfig object", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{}}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Should work with default behavior (first click shows popover, not image overlay)
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Popover should be shown
            await waitForPopoverVisible(container);
        });
        it("handles verification without image correctly in context", async () => {
            const onEnter = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage} behaviorConfig={{ onHover: { onEnter } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseEnter(citation);
            });
            const context = onEnter.mock.calls[0][0];
            expect(context.hasImage).toBe(false);
        });
        it("handles null verification correctly in context", async () => {
            const onEnter = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={null} behaviorConfig={{ onHover: { onEnter } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseEnter(citation);
            });
            const context = onEnter.mock.calls[0][0];
            expect(context.verification).toBeNull();
            expect(context.hasImage).toBe(false);
        });
        it("handles miss verification correctly", async () => {
            const customOnClick = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={missVerification} behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            const context = customOnClick.mock.calls[0][0];
            expect(context.hasImage).toBe(false);
        });
    });
    // ==========================================================================
    // HIGHLIGHTED PHRASE - MISS BEHAVIOR TESTS
    // Tests for the isMiss prop added to prevent misleading highlighting
    // ==========================================================================
    describe("HighlightedSourceContext - isMiss behavior", () => {
        it("should not highlight anchor text when citation is not found", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={missVerification}/>);
            // Click to open popover
            const trigger = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(trigger);
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
                const style = el.style;
                return style.backgroundColor && style.backgroundColor !== "";
            });
            expect(actualHighlights.length).toBe(0);
        });
        it("should highlight anchor text when status is verified", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            // Click to open popover
            const trigger = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(trigger);
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
                const style = el.style;
                return style.borderRadius === "2px" && style.padding === "0px 1px";
            });
            // For verified status, we expect at least one highlighted span
            expect(actualHighlights.length).toBeGreaterThan(0);
        });
        it("highlights anchor inside the snippet in the no-image fallback view", async () => {
            // Iter 23 polish: PopoverFallbackView (verified citation, no evidence
            // image) used to render the snippet as flat text via normalizeSnippetText.
            // The reader saw the broader phrase but never saw the anchor highlighted
            // inside it — breaking the display→popover→evidence threading the
            // expanded view (ClaimQuote) already provided. The fallback now uses
            // HighlightedSourceContext too, mirroring the main path.
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage}/>);
            const trigger = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            // ANCHOR_HIGHLIGHT_STYLE: borderRadius: "2px", padding: "0 1px"
            // The fallback popover renders inside the open popover container
            // (CitationDrawer/Popover may rely on portal — search document scope,
            // mirroring the verified-status test above).
            const highlightedElements = document.querySelectorAll("span[style*='border-radius']");
            const actualHighlights = Array.from(highlightedElements).filter(el => {
                const style = el.style;
                return style.borderRadius === "2px" && style.padding === "0px 1px";
            });
            expect(actualHighlights.length).toBeGreaterThan(0);
        });
        it("should not highlight when sourceMatch is missing", async () => {
            const citationWithoutAnchor = {
                ...baseCitation,
                sourceMatch: undefined,
            };
            const { container } = render(<CitationComponent citation={citationWithoutAnchor} verification={verificationWithImage}/>);
            // Click to open popover
            const trigger = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(trigger);
            });
            // Wait for popover to open
            await waitForPopoverVisible(container);
            // No highlighting should occur
            const popoverContent = container.querySelector('[data-state="open"]');
            const highlightedElements = popoverContent?.querySelectorAll("span[style*='background']");
            const actualHighlights = Array.from(highlightedElements || []).filter(el => {
                const style = el.style;
                return style.backgroundColor && style.backgroundColor !== "";
            });
            expect(actualHighlights.length).toBe(0);
        });
    });
});
// =============================================================================
// HIGHLIGHTED PHRASE - DIRECT UNIT TESTS
// Render HighlightedSourceContext in isolation to exercise edge cases that are awkward
// to reach through CitationComponent (e.g. sourceMatch === sourceContext, where the
// snippet IS the anchor — common in the no-image fallback popover for short
// citations after normalizeSnippetText cleans OCR spacing).
// =============================================================================
describe("HighlightedSourceContext - direct rendering", () => {
    afterEach(() => {
        cleanup();
    });
    // Helper: count spans that carry ANCHOR_HIGHLIGHT_STYLE
    // (borderRadius:2px, padding:0 1px). The backgroundColor uses a CSS var that
    // jsdom does not resolve, so we identify the highlight by its layout props.
    const countHighlightSpans = (root) => {
        const spans = root.querySelectorAll("span[style*='border-radius']");
        return Array.from(spans).filter(el => {
            const style = el.style;
            return style.borderRadius === "2px" && style.padding === "0px 1px";
        }).length;
    };
    it("highlights the entire phrase when sourceMatch === sourceContext", () => {
        // When normalizeSnippetText collapses the snippet to exactly the anchor
        // (short citations, single-clause phrases), we still want a visible
        // highlight so the reader sees that the popover snippet IS the matched
        // anchor — not flat text indistinguishable from non-cited copy.
        const { container } = render(<HighlightedSourceContext sourceContext="motor vehicle" sourceMatch="motor vehicle"/>);
        expect(countHighlightSpans(container)).toBe(1);
        expect(container.textContent).toBe("motor vehicle");
    });
    it("still highlights an anchor that has surrounding context", () => {
        // Sanity check: the partial-match path keeps working unchanged.
        const { container } = render(<HighlightedSourceContext sourceContext="The driver of the motor vehicle yielded." sourceMatch="motor vehicle"/>);
        expect(countHighlightSpans(container)).toBe(1);
        expect(container.textContent).toBe("The driver of the motor vehicle yielded.");
    });
    it("prints and highlights sourceMatch when OCR context does not contain it", () => {
        const { container } = render(<HighlightedSourceContext sourceContext="PHQ9 Total Score 3" sourceMatch="18"/>);
        expect(countHighlightSpans(container)).toBe(1);
        expect(container.textContent).toBe("PHQ9 Total Score 3 18");
    });
    it("does not highlight when isMiss is true even if anchor === phrase", () => {
        // Miss citations must never render the highlight — the anchor was not
        // found, so highlighting it would be misleading regardless of length.
        const { container } = render(<HighlightedSourceContext sourceContext="motor vehicle" sourceMatch="motor vehicle" isMiss={true}/>);
        expect(countHighlightSpans(container)).toBe(0);
        expect(container.textContent).toBe("motor vehicle");
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
    const baseCitation = {
        citationNumber: 1,
        sourceMatch: "test citation",
        sourceContext: "This is a test citation phrase",
    };
    const verificationWithImage = {
        evidence: {
            src: "data:image/png;base64,iVBORw0KGgo=",
        },
        sourceSnippet: "test citation phrase",
        status: "found",
    };
    // Helper to mock touch device detection
    function mockTouchDevice(isTouch) {
        Object.defineProperty(navigator, "maxTouchPoints", {
            writable: true,
            configurable: true,
            value: isTouch ? 5 : 0,
        });
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: mock(() => { }).mockImplementation((query) => ({
                matches: isTouch && query === "(pointer: coarse)",
                media: query,
                onchange: null,
                addListener: mock(() => { }),
                removeListener: mock(() => { }),
                addEventListener: mock(() => { }),
                removeEventListener: mock(() => { }),
                dispatchEvent: mock(() => { }),
            })),
        });
    }
    describe("auto-detection of touch devices", () => {
        it("auto-detects touch device when isMobile prop is not provided", async () => {
            mockTouchDevice(true);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            expect(citation).toBeInTheDocument();
            // On touch devices, first tap should show popover, not open image overlay
            // Simulate touch sequence: touchStart then click
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // First tap should NOT open the full-screen image overlay
            // (popover behavior is handled by hover state, not dialog)
            // The key check is that image overlay dialog is NOT shown on first tap
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
        it("does not auto-enable mobile mode on non-touch devices", async () => {
            mockTouchDevice(false);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            // On non-touch devices, click should show popover (not image overlay)
            // as we now use lazy mode by default for all devices
            await act(async () => {
                fireEvent.click(citation);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Simulate touch sequence
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // First tap should NOT open image overlay (mobile behavior)
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
        it("isMobile={false} forces desktop behavior even on touch device", async () => {
            mockTouchDevice(true);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={false}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Click should show popover (lazy mode is now default for all devices)
            await act(async () => {
                fireEvent.click(citation);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First tap - should show popover (not image overlay)
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // Popover should be visible
            await waitForPopoverVisible(container);
            // Second tap - closes popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // Popover should be dismissed
            await waitForPopoverDismissed(container);
        });
        it("multiple taps toggle popover open/closed without opening image overlay", async () => {
            mockTouchDevice(true);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First tap - show popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            await waitForPopoverVisible(container);
            // Second tap - close popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            await waitForPopoverDismissed(container);
            // Third tap - reopen popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            await waitForPopoverVisible(container);
        });
        it("mobile tap without verification image still shows popover on first tap", async () => {
            mockTouchDevice(true);
            const verificationNoImage = {
                status: "found",
                sourceSnippet: "Test match snippet",
            };
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationNoImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First tap - should show popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // No image overlay (no image available)
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Second tap - still no image overlay (no image available)
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
        it("cross-citation tapping is not incorrectly debounced (each citation has its own timer)", async () => {
            mockTouchDevice(true);
            const citation1 = {
                citationNumber: 1,
                sourceMatch: "first citation",
                sourceContext: "This is the first citation",
            };
            const citation2 = {
                citationNumber: 2,
                sourceMatch: "second citation",
                sourceContext: "This is the second citation",
            };
            const { container } = render(<>
          <CitationComponent citation={citation1} verification={verificationWithImage}/>
          <CitationComponent citation={citation2} verification={verificationWithImage}/>
        </>);
            const citations = container.querySelectorAll("[data-citation-id]");
            const citationA = citations[0];
            const citationB = citations[1];
            // Tap citation A
            await act(async () => {
                fireEvent.touchStart(citationA);
                fireEvent.click(citationA);
            });
            // Immediately tap citation B (within debounce window if it were global)
            // This should NOT be debounced because each citation has its own timer
            await act(async () => {
                fireEvent.touchStart(citationB);
                fireEvent.click(citationB);
            });
            // Both citations should have responded to their first tap
            // (no image overlay since it's first tap for each)
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Now second tap on citation B should toggle details (proves citation B wasn't incorrectly debounced)
            await act(async () => {
                fireEvent.touchStart(citationB);
                fireEvent.click(citationB);
            });
            // No image overlay - second tap toggles details, not image
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
        it("second tap toggles phrase expansion for miss citations (no image)", async () => {
            mockTouchDevice(true);
            const missCitation = {
                citationNumber: 1,
                sourceMatch: "unfound citation",
                sourceContext: "This citation was not found in the document",
            };
            const missVerification = {
                status: "not_found",
                searchAttempts: [
                    {
                        phrase: "unfound citation",
                        phraseType: "source_match",
                        pageNumber: 1,
                        lineIds: [1],
                        method: "exact",
                        foundMatch: false,
                    },
                ],
            };
            const { container } = render(<CitationComponent citation={missCitation} verification={missVerification}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First tap - show popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // No image overlay (it's a miss, no image)
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Second tap - should toggle phrase expansion (not image overlay)
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // Still no image overlay (miss citation behavior toggles phrases, not image)
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
        it("custom behaviorConfig.onClick receives TouchEvent on mobile", async () => {
            mockTouchDevice(true);
            const onClickMock = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} behaviorConfig={{
                    onClick: onClickMock,
                }}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Tap on mobile
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.touchEnd(citation);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy"/>);
            const citation = container.querySelector("[data-citation-id]");
            // First tap - should show popover (mobile two-tap behavior)
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // No image overlay yet (first tap shows popover)
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Second tap - should toggle details (not open image in lazy mode)
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // No image overlay - second tap toggles details, not image
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
    });
    describe("mobile tap-outside dismiss", () => {
        it("tapping outside the popover dismisses it on mobile", async () => {
            mockTouchDevice(true);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First tap - should show popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // Popover should be visible
            await waitForPopoverVisible(container);
            // Tap outside (on document body) - should dismiss popover.
            // Full tap gesture: touchstart + touchend (no touchmove = finger didn't move).
            await act(async () => {
                fireEvent.touchStart(document.body, { touches: [{ clientX: 0, clientY: 0 }] });
                fireEvent.touchEnd(document.body);
            });
            // Popover should be dismissed
            await waitForPopoverDismissed(container);
        });
        it("tapping inside the popover content does NOT dismiss it", async () => {
            mockTouchDevice(true);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First tap - should show popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // Wait for popover to be visible
            await waitFor(() => {
                const popoverContent = container.querySelector('[data-state="open"]');
                expect(popoverContent).toBeInTheDocument();
            });
            // Find the popover content and tap inside it
            const popoverContent = container.querySelector('[data-state="open"]');
            await act(async () => {
                fireEvent.touchStart(popoverContent);
            });
            // Popover should still be visible (not dismissed)
            await waitFor(() => {
                const popover = container.querySelector('[data-state="open"]');
                expect(popover).toBeInTheDocument();
            });
        });
        it("tapping the trigger while popover is open closes the popover", async () => {
            mockTouchDevice(true);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First tap - should show popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // Wait for popover to be visible
            await waitForPopoverVisible(container);
            // Second tap on trigger - should close the popover
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
            });
            // Popover should be dismissed
            await waitForPopoverDismissed(container);
        });
        it("desktop mode (isMobile=false) does not dismiss on outside click", async () => {
            mockTouchDevice(false);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={false}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Click to show popover (lazy mode - click opens popover)
            await act(async () => {
                fireEvent.click(citation);
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
            const { container, unmount } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Rapidly open and close popover multiple times
            for (let i = 0; i < 3; i++) {
                // Open popover
                await act(async () => {
                    fireEvent.touchStart(citation);
                    fireEvent.click(citation);
                });
                // Close by tapping outside (full tap: touchstart + touchend)
                await act(async () => {
                    fireEvent.touchStart(document.body, { touches: [{ clientX: 0, clientY: 0 }] });
                    fireEvent.touchEnd(document.body);
                });
            }
            // Final open
            await act(async () => {
                fireEvent.touchStart(citation);
                fireEvent.click(citation);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First Enter - should show popover (not image)
            await act(async () => {
                fireEvent.keyDown(citation, { key: "Enter" });
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Second Enter - toggles details (not image)
            await act(async () => {
                fireEvent.keyDown(citation, { key: "Enter" });
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
        it("Space key shows popover first, second press toggles details", async () => {
            mockTouchDevice(false);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First Space - should show popover (not image)
            await act(async () => {
                fireEvent.keyDown(citation, { key: " " });
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Second Space - toggles details (not image)
            await act(async () => {
                fireEvent.keyDown(citation, { key: " " });
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
        it("Enter key with deprecated interactionMode still uses lazy behavior", async () => {
            mockTouchDevice(false);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy"/>);
            const citation = container.querySelector("[data-citation-id]");
            // First Enter - should show popover (not image)
            await act(async () => {
                fireEvent.keyDown(citation, { key: "Enter" });
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Second Enter - toggles details (not image in lazy mode)
            await act(async () => {
                fireEvent.keyDown(citation, { key: "Enter" });
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
        });
        it("citation has correct ARIA attributes", () => {
            mockTouchDevice(false);
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
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
    const baseCitation = {
        citationNumber: 1,
        sourceMatch: "test citation",
        sourceContext: "This is a test citation phrase",
    };
    const verificationWithImage = {
        evidence: {
            src: "data:image/png;base64,iVBORw0KGgo=",
        },
        sourceSnippet: "test citation phrase",
        status: "found",
    };
    const verificationWithoutImage = {
        sourceSnippet: "test citation phrase",
        status: "found",
    };
    describe("deprecated eager mode (now uses lazy behavior)", () => {
        it("does NOT show popover on hover (deprecated eager mode uses lazy behavior)", async () => {
            const onEnter = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="eager" behaviorConfig={{ onHover: { onEnter } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseEnter(citation);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="eager"/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="eager"/>);
            const citation = container.querySelector("[data-citation-id]");
            expect(citation).toHaveClass("cursor-pointer");
        });
        it("has cursor-pointer class when no image is available", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage} interactionMode="eager"/>);
            const citation = container.querySelector("[data-citation-id]");
            expect(citation).toHaveClass("cursor-pointer");
        });
        it("default behavior (no interactionMode) uses lazy mode", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const citation = container.querySelector("[data-citation-id]");
            // Click should show popover, not image directly (lazy mode is default)
            await act(async () => {
                fireEvent.click(citation);
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
            const onEnter = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" behaviorConfig={{ onHover: { onEnter } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseEnter(citation);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy"/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
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
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy"/>);
            const citation = container.querySelector("[data-citation-id]");
            // First click - shows popover
            await act(async () => {
                fireEvent.click(citation);
            });
            await waitForPopoverVisible(container);
            // Second click - closes popover
            await act(async () => {
                fireEvent.click(citation);
            });
            await waitForPopoverDismissed(container);
        });
        it("has cursor-pointer class initially (before popover is shown)", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy"/>);
            const citation = container.querySelector("[data-citation-id]");
            expect(citation).toHaveClass("cursor-pointer");
        });
        it("stays cursor-pointer after first click (lazy mode doesn't zoom)", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy"/>);
            const citation = container.querySelector("[data-citation-id]");
            // Initially cursor-pointer
            expect(citation).toHaveClass("cursor-pointer");
            // First click - shows popover
            fireEvent.click(citation);
            // In lazy mode, cursor stays as pointer (not zoom-in)
            expect(citation).toHaveClass("cursor-pointer");
        });
        it("stays cursor-pointer throughout interactions in lazy mode", () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy"/>);
            const citation = container.querySelector("[data-citation-id]");
            // Initially cursor-pointer
            expect(citation).toHaveClass("cursor-pointer");
            // First click - shows popover
            fireEvent.click(citation);
            expect(citation).toHaveClass("cursor-pointer");
            // Second click - closes popover
            fireEvent.click(citation);
            expect(citation).toHaveClass("cursor-pointer");
        });
        it("still triggers eventHandlers.onClick on both clicks", async () => {
            const onClick = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" eventHandlers={{ onClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            // First click
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(onClick).toHaveBeenCalledTimes(1);
            // Second click
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(onClick).toHaveBeenCalledTimes(2);
        });
        it("works correctly without image (no zoom needed)", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithoutImage} interactionMode="lazy"/>);
            const citation = container.querySelector("[data-citation-id]");
            // First click - activates hover state (would show popover)
            await act(async () => {
                fireEvent.click(citation);
            });
            // Image overlay should NOT open (no image available)
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Second click - still no image to zoom
            await act(async () => {
                fireEvent.click(citation);
            });
            expect(container.querySelector("img[alt='Full page verification']")).not.toBeInTheDocument();
            // Cursor should remain pointer (no image to zoom)
            expect(citation).toHaveClass("cursor-pointer");
        });
        it("applies hover styles but not popover on hover", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy"/>);
            const citation = container.querySelector("[data-citation-id]");
            // Hover should apply visual styles but not show popover
            await act(async () => {
                fireEvent.mouseEnter(citation);
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
            const customOnClick = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Custom onClick should be called instead of lazy mode default
            expect(customOnClick).toHaveBeenCalledTimes(1);
            // Neither popover nor image overlay should open (custom handler takes over)
            expect(container.querySelector("[role='dialog']")).not.toBeInTheDocument();
        });
        it("custom onClick returning actions works in lazy mode", async () => {
            const customOnClick = mock(() => ({
                setImageExpanded: true,
            }));
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" behaviorConfig={{ onClick: customOnClick }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(citation);
            });
            // Custom action should open image directly (bypassing lazy mode)
            expect(document.querySelector("[role='dialog']")).toBeInTheDocument();
        });
        it("onHover callbacks still work in lazy mode", async () => {
            const onEnter = mock(() => { });
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} interactionMode="lazy" behaviorConfig={{ onHover: { onEnter } }}/>);
            const citation = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.mouseEnter(citation);
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
                value: mock(() => { }).mockImplementation(query => ({
                    matches: query === "(pointer: fine)", // Desktop
                    media: query,
                    onchange: null,
                    addEventListener: mock(() => { }),
                    removeEventListener: mock(() => { }),
                    dispatchEvent: mock(() => { }),
                })),
            });
        });
        it("dismisses popover when clicking outside on desktop", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const trigger = container.querySelector("[data-citation-id]");
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
        it("dismisses popover on mouse outside click even when mobile mode is active", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage} isMobile={true}/>);
            const trigger = container.querySelector("[data-citation-id]");
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            await act(async () => {
                fireEvent.mouseDown(document.body);
            });
            await waitForPopoverDismissed(container);
        });
        it("keeps popover wrapper interactive during page scroll activity", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const trigger = container.querySelector("[data-citation-id]");
            // Click to open popover
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            const wrapper = container.querySelector("[data-dc-popover-wrapper]");
            expect(wrapper).toBeInTheDocument();
            // Simulate active page scroll while popover is open.
            await act(async () => {
                fireEvent.scroll(window);
            });
            await waitFor(() => {
                expect(window.getComputedStyle(wrapper).pointerEvents).toBe("auto");
            });
        });
        it("still dismisses on outside click immediately after page scroll activity", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const trigger = container.querySelector("[data-citation-id]");
            // Click to open popover
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            const wrapper = container.querySelector("[data-dc-popover-wrapper]");
            expect(wrapper).toBeInTheDocument();
            // Simulate active page scroll while popover is open.
            await act(async () => {
                fireEvent.scroll(window);
            });
            await waitFor(() => {
                expect(window.getComputedStyle(wrapper).pointerEvents).toBe("auto");
            });
            // Outside click should dismiss immediately.
            await act(async () => {
                fireEvent.mouseDown(document.body);
            });
            await waitForPopoverDismissed(container);
        });
        it("does not dismiss when clicking inside trigger", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const trigger = container.querySelector("[data-citation-id]");
            // Click to open popover
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            // A full click on the trigger toggles the popover (by design), so we
            // verify via a second full click that the toggle cycle works and the
            // outside-dismiss handler did not interfere.  A third click should
            // re-open the popover, proving the previous close was a toggle, not
            // an outside-dismiss.
            await act(async () => {
                fireEvent.click(trigger);
            });
            // Toggled closed — expected
            await waitFor(() => {
                expect(container.querySelector('[data-state="open"]')).toBeNull();
            });
            await act(async () => {
                fireEvent.click(trigger);
            });
            // Toggled open again — proves outside-dismiss didn't break the cycle
            await waitForPopoverVisible(container);
        });
        it("does not dismiss when clicking inside popover content", async () => {
            const { container } = render(<CitationComponent citation={baseCitation} verification={verificationWithImage}/>);
            const trigger = container.querySelector("[data-citation-id]");
            // Click to open popover
            await act(async () => {
                fireEvent.click(trigger);
            });
            await waitForPopoverVisible(container);
            const popoverContent = container.querySelector('[data-state="open"]');
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
    const baseCitation = {
        type: "document",
        attachmentId: "abc123",
        citationNumber: 1,
        pageNumber: 5,
        sourceMatch: "test citation",
        sourceContext: "This is a test citation phrase",
    };
    it("renders static text when proof URL is not available", async () => {
        const verification = {
            status: "found",
            label: "Document.pdf",
            sourceSnippet: "test citation phrase",
            document: { verifiedPageNumber: 5 },
        };
        const { container } = render(<CitationComponent citation={baseCitation} verification={verification}/>);
        // Click to open popover
        const trigger = container.querySelector("[data-citation-id]");
        await act(async () => {
            fireEvent.click(trigger);
        });
        await waitForPopoverVisible(container);
        // Should not have any links in the popover
        const links = container.querySelectorAll("a");
        const proofLinks = Array.from(links).filter(link => link.textContent?.includes("Page 5"));
        expect(proofLinks.length).toBe(0);
    });
});
describe("security: evidence src validation", () => {
    afterEach(() => {
        cleanup();
    });
    const baseCitation = {
        type: "document",
        attachmentId: "abc123",
        citationNumber: 1,
        pageNumber: 5,
        sourceMatch: "test citation",
        sourceContext: "This is a test citation phrase",
    };
    it("does not render javascript: URI from evidence.src as <img src>", async () => {
        const verification = {
            status: "found",
            label: "Document.pdf",
            sourceSnippet: "test citation phrase",
            document: { verifiedPageNumber: 5 },
            evidence: { src: "javascript:alert('XSS')" },
        };
        const { container } = render(<CitationComponent citation={baseCitation} verification={verification}/>);
        const trigger = container.querySelector("[data-citation-id]");
        await act(async () => {
            fireEvent.click(trigger);
        });
        await waitForPopoverVisible(container);
        const imgs = Array.from(container.querySelectorAll("img"));
        const maliciousImgs = imgs.filter(img => img.getAttribute("src")?.startsWith("javascript:"));
        expect(maliciousImgs.length).toBe(0);
    });
    it("does not render data:text/html URI from evidence.src as <img src>", async () => {
        const verification = {
            status: "found",
            label: "Document.pdf",
            sourceSnippet: "test citation phrase",
            document: { verifiedPageNumber: 5 },
            evidence: { src: "data:text/html,<script>alert('XSS')</script>" },
        };
        const { container } = render(<CitationComponent citation={baseCitation} verification={verification}/>);
        const trigger = container.querySelector("[data-citation-id]");
        await act(async () => {
            fireEvent.click(trigger);
        });
        await waitForPopoverVisible(container);
        const imgs = Array.from(container.querySelectorAll("img"));
        const maliciousImgs = imgs.filter(img => img.getAttribute("src")?.startsWith("data:text/html"));
        expect(maliciousImgs.length).toBe(0);
    });
    it("does not render SVG data URI from evidence.src as <img src>", async () => {
        const svgSrc = "data:image/svg+xml,<svg onload=alert(1)></svg>";
        const verification = {
            status: "found",
            label: "Document.pdf",
            sourceSnippet: "test citation phrase",
            document: { verifiedPageNumber: 5 },
            evidence: { src: svgSrc },
        };
        const { container } = render(<CitationComponent citation={baseCitation} verification={verification}/>);
        const trigger = container.querySelector("[data-citation-id]");
        await act(async () => {
            fireEvent.click(trigger);
        });
        await waitForPopoverVisible(container);
        const imgs = Array.from(container.querySelectorAll("img"));
        const maliciousImgs = imgs.filter(img => img.getAttribute("src") === svgSrc);
        expect(maliciousImgs.length).toBe(0);
    });
});
