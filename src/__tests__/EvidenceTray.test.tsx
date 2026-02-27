import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, render } from "@testing-library/react";
import { EvidenceTray, InlineExpandedImage } from "../react/EvidenceTray";
import type { CitationStatus } from "../types/citation";
import type { Verification } from "../types/verification";

const baseStatus: CitationStatus = {
  isVerified: true,
  isMiss: false,
  isPartialMatch: false,
  isPending: false,
};

const baseVerification: Verification = {
  status: "found",
  document: {
    verificationImageSrc: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
  },
};

describe("EvidenceTray interaction styles", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders static muted helper hint for interactive trays", () => {
    const { getByText } = render(
      <EvidenceTray verification={baseVerification} status={baseStatus} onExpand={() => {}} />,
    );

    const hint = getByText("· Click to expand");
    expect(hint.className).toContain("font-medium");
    expect(hint.className).toContain("text-gray-400");
  });

  it("renders tertiary View page action with blue hover and focus ring styles", () => {
    const { getByRole } = render(
      <EvidenceTray verification={baseVerification} status={baseStatus} onExpand={() => {}} />,
    );

    const viewPageButton = getByRole("button", { name: /view page/i });
    expect(viewPageButton.className).toContain("text-gray-600");
    expect(viewPageButton.className).toContain("hover:text-blue-600");
    expect(viewPageButton.className).toContain("focus-visible:ring-2");
  });
});

// =============================================================================
// InlineExpandedImage — onNaturalSize dedup & ref-reset smoke tests
// =============================================================================

describe("InlineExpandedImage onNaturalSize", () => {
  let observerCallback: ResizeObserverCallback;

  // jsdom doesn't provide ResizeObserver — supply a minimal mock that
  // fires immediately with a fixed container rect.
  const mockEntry: ResizeObserverEntry = {
    contentRect: { width: 600, height: 400, x: 0, y: 0, top: 0, right: 600, bottom: 400, left: 0, toJSON: () => ({}) },
    borderBoxSize: [{ blockSize: 400, inlineSize: 600 }],
    contentBoxSize: [{ blockSize: 400, inlineSize: 600 }],
    devicePixelContentBoxSize: [{ blockSize: 400, inlineSize: 600 }],
    target: document.createElement("div"),
  };

  const mockResizeObserver = jest.fn<(cb: ResizeObserverCallback) => ResizeObserver>().mockImplementation(cb => {
    observerCallback = cb;
    return {
      observe: jest.fn<ResizeObserver["observe"]>().mockImplementation(() => {
        // Fire immediately with a 600×400 rect
        const mockObserver: ResizeObserver = { observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() };
        observerCallback([mockEntry], mockObserver);
      }),
      unobserve: jest.fn<ResizeObserver["unobserve"]>(),
      disconnect: jest.fn<ResizeObserver["disconnect"]>(),
    };
  });

  beforeEach(() => {
    (globalThis as Record<string, unknown>).ResizeObserver = mockResizeObserver;
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  /** Simulate the browser firing the <img> onLoad with given natural dimensions. */
  function fireImageLoad(container: HTMLElement, naturalWidth: number, naturalHeight: number) {
    const img = container.querySelector("img");
    if (!img) throw new Error("No <img> found in InlineExpandedImage");
    Object.defineProperty(img, "naturalWidth", { value: naturalWidth, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: naturalHeight, configurable: true });
    act(() => {
      img.dispatchEvent(new Event("load", { bubbles: false }));
    });
  }

  it("calls onNaturalSize after image load in fill mode", () => {
    const onNaturalSize = jest.fn<(w: number, h: number) => void>();
    const { container } = render(
      <InlineExpandedImage
        src="https://proof.deepcitation.com/page1.avif"
        onCollapse={() => {}}
        fill
        onNaturalSize={onNaturalSize}
      />,
    );
    fireImageLoad(container, 800, 1200);
    expect(onNaturalSize).toHaveBeenCalled();
    const [w, h] = onNaturalSize.mock.calls[0];
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  });

  it("re-fires onNaturalSize after src changes (ref reset)", () => {
    const onNaturalSize = jest.fn<(w: number, h: number) => void>();
    const { container, rerender } = render(
      <InlineExpandedImage
        src="https://proof.deepcitation.com/page1.avif"
        onCollapse={() => {}}
        fill
        onNaturalSize={onNaturalSize}
      />,
    );
    fireImageLoad(container, 800, 1200);
    const callCountAfterFirst = onNaturalSize.mock.calls.length;

    // Change src — this should reset lastReportedSizeRef so onNaturalSize fires again
    rerender(
      <InlineExpandedImage
        src="https://proof.deepcitation.com/page2.avif"
        onCollapse={() => {}}
        fill
        onNaturalSize={onNaturalSize}
      />,
    );
    fireImageLoad(container, 800, 1200);
    expect(onNaturalSize.mock.calls.length).toBeGreaterThan(callCountAfterFirst);
  });
});
