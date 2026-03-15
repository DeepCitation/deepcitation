import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type React from "react";
import { createRef } from "react";
import { EvidenceTray, InlineExpandedImage, resolveExpandedImageForPage } from "../react/EvidenceTray";
import type { CitationStatus } from "../types/citation";
import type { PageImage, Verification } from "../types/verification";

const baseStatus: CitationStatus = {
  isVerified: true,
  isMiss: false,
  isPartialMatch: false,
  isPending: false,
};

const baseVerification: Verification = {
  status: "found",
  evidence: {
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
  },
};

describe("EvidenceTray interaction styles", () => {
  afterEach(() => {
    jest.useRealTimers();
    cleanup();
  });

  function setKeyholeViewportSize(container: HTMLElement, width: number, height: number) {
    const strip = container.querySelector("[data-dc-keyhole]") as HTMLElement | null;
    if (!strip) throw new Error("No keyhole strip found");
    Object.defineProperty(strip, "clientWidth", { value: width, configurable: true });
    Object.defineProperty(strip, "clientHeight", { value: height, configurable: true });
    Object.defineProperty(strip, "scrollWidth", { value: width, configurable: true });
    Object.defineProperty(strip, "scrollHeight", { value: height, configurable: true });
  }

  function fireKeyholeImageLoad(container: HTMLElement, naturalWidth: number, naturalHeight: number) {
    const img = container.querySelector("[data-dc-keyhole] img");
    if (!img) throw new Error("No keyhole image found");
    Object.defineProperty(img, "naturalWidth", { value: naturalWidth, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: naturalHeight, configurable: true });
    act(() => {
      img.dispatchEvent(new Event("load", { bubbles: false }));
    });
  }

  function clickKeyholeButton(container: HTMLElement) {
    const strip = container.querySelector("[data-dc-keyhole]");
    if (!strip) throw new Error("No keyhole strip found");
    const button = strip.closest("button");
    if (!(button instanceof HTMLButtonElement)) throw new Error("No keyhole button found");
    fireEvent.click(button);
  }

  it("renders tertiary View page action with blue hover and focus ring styles", () => {
    const { getByRole } = render(
      <EvidenceTray verification={baseVerification} status={baseStatus} onExpand={() => {}} />,
    );

    const viewPageButton = getByRole("button", { name: /view page/i });
    expect(viewPageButton.className).toContain("text-dc-muted-foreground");
    expect(viewPageButton.className).toContain("hover:text-dc-foreground");
    expect(viewPageButton.className).toContain("focus-visible:ring-2");
  });

  it('uses a custom footer CTA label when provided (for example, "View image")', () => {
    const { getByRole, queryByRole } = render(
      <EvidenceTray
        verification={baseVerification}
        status={baseStatus}
        onExpand={() => {}}
        pageCtaLabel="View image"
      />,
    );

    expect(getByRole("button", { name: "View image" })).toBeInTheDocument();
    expect(queryByRole("button", { name: /view page/i })).not.toBeInTheDocument();
  });

  it("uses Attempts wording in miss-state search toggle", () => {
    const missStatus: CitationStatus = {
      isVerified: false,
      isMiss: true,
      isPartialMatch: false,
      isPending: false,
    };
    const missVerification: Verification = {
      status: "not_found",
      citation: {
        fullPhrase: "Revenue increased by 15% in Q4 2024.",
        anchorText: "increased by 15%",
        pageNumber: 5,
        lineIds: [12],
      },
      searchAttempts: [
        {
          method: "exact_line_match",
          success: false,
          searchPhrase: "Revenue increased by 15% in Q4 2024.",
          pageSearched: 5,
        },
      ],
    };

    const { getByRole, queryByRole } = render(<EvidenceTray verification={missVerification} status={missStatus} />);

    expect(getByRole("button", { name: /1 attempt/i })).toBeInTheDocument();
    expect(queryByRole("button", { name: /1 search/i })).not.toBeInTheDocument();
  });

  it("collapses the search log when an attempt row is clicked instead of opening the page", async () => {
    const missStatus: CitationStatus = {
      isVerified: false,
      isMiss: true,
      isPartialMatch: false,
      isPending: false,
    };
    const onExpand = jest.fn<() => void>();
    const missVerification: Verification = {
      status: "not_found",
      citation: {
        fullPhrase: "alpha",
        anchorText: "alpha",
        pageNumber: 2,
        lineIds: [4],
      },
      searchAttempts: [
        {
          method: "exact_line_match",
          success: false,
          searchPhrase: "alpha",
          pageSearched: 2,
        },
      ],
    };

    const { getByRole, getByText, queryByText } = render(
      <EvidenceTray verification={missVerification} status={missStatus} onExpand={onExpand} />,
    );

    // Open search log and let React flush effects.
    await act(async () => {
      fireEvent.click(getByRole("button", { name: /1 attempt/i }));
    });
    const attemptRowText = getByText("alpha");

    // Click the attempt row — should collapse, not expand the page.
    await act(async () => {
      fireEvent.click(attemptRowText);
    });
    expect(onExpand).not.toHaveBeenCalled();

    // Wait past the 80ms EVIDENCE_LIST_COLLAPSE_TOTAL_MS animation using a
    // real timer wrapped in act() so React flushes the unmount state update.
    // This is more reliable than waitFor in bun's test runner (where MutationObserver
    // polling can hang until bun's 5 s test timeout fires).
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 200));
    });
    expect(queryByText("alpha")).not.toBeInTheDocument();
  });

  it("sets escapeInterceptRef to a collapse function when search log is open", () => {
    const missStatus: CitationStatus = {
      isVerified: false,
      isMiss: true,
      isPartialMatch: false,
      isPending: false,
    };
    const missVerification: Verification = {
      status: "not_found",
      citation: {
        fullPhrase: "beta phrase",
        anchorText: "beta",
        pageNumber: 1,
        lineIds: [2],
      },
      searchAttempts: [
        {
          method: "exact_line_match",
          success: false,
          searchPhrase: "beta phrase",
          pageSearched: 1,
        },
      ],
    };

    const escapeInterceptRef = createRef<(() => void) | null>() as React.MutableRefObject<(() => void) | null>;
    escapeInterceptRef.current = null;

    const { getByRole } = render(
      <EvidenceTray verification={missVerification} status={missStatus} escapeInterceptRef={escapeInterceptRef} />,
    );

    // Before opening: ref should be null
    expect(escapeInterceptRef.current).toBeNull();

    // Open search log
    fireEvent.click(getByRole("button", { name: /1 attempt/i }));

    // Ref should now be a collapse function
    expect(typeof escapeInterceptRef.current).toBe("function");

    // Call the intercept — triggers setShowSearchLog(false).
    // The useEffect on showSearchLog synchronously clears the ref.
    act(() => {
      if (escapeInterceptRef.current) escapeInterceptRef.current();
    });

    // Ref should be cleared (showSearchLog is now false)
    expect(escapeInterceptRef.current).toBeNull();
  });

  it("resolves exact page image when verification pageNumber values are numeric strings", () => {
    const page1Src = "https://proof.deepcitation.com/page1.png";
    const page5Src = "https://proof.deepcitation.com/page5.png";
    const verificationWithStringPages = { status: "found" } as Verification;
    const pageImages = [
      { pageNumber: "1", imageUrl: page1Src, dimensions: { width: 1000, height: 1400 } },
      { pageNumber: "5", imageUrl: page5Src, dimensions: { width: 1000, height: 1400 } },
    ] as unknown as PageImage[];

    const resolved = resolveExpandedImageForPage(verificationWithStringPages, 5, pageImages);
    expect(resolved?.src).toBe(page5Src);
  });

  it("resolveExpandedImageForPage passes document overrides when exact page is the match page", () => {
    const pageSrc = "https://proof.deepcitation.com/page5.png";
    const verification = {
      status: "found",
      document: {
        verifiedPageNumber: 5,
        renderScale: { x: 2, y: 2 },
        highlightBox: { x: 10, y: 20, width: 100, height: 50 },
        textItems: [{ text: "hello", x: 10, y: 20, width: 50, height: 12 }],
      },
    } as unknown as Verification;
    const pageImages = [
      { pageNumber: 5, imageUrl: pageSrc, dimensions: { width: 1000, height: 1400 } },
    ] as unknown as PageImage[];

    const resolved = resolveExpandedImageForPage(verification, 5, pageImages);
    expect(resolved?.src).toBe(pageSrc);
    expect(resolved?.renderScale).toEqual({ x: 2, y: 2 });
    expect(resolved?.highlightBox).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it("resolveExpandedImageForPage does not pass document overrides for non-match pages", () => {
    const page3Src = "https://proof.deepcitation.com/page3.png";
    const page5Src = "https://proof.deepcitation.com/page5.png";
    const verification = {
      status: "found",
      document: {
        verifiedPageNumber: 5,
        renderScale: { x: 2, y: 2 },
        highlightBox: { x: 10, y: 20, width: 100, height: 50 },
      },
    } as unknown as Verification;
    const pageImages = [
      { pageNumber: 3, imageUrl: page3Src, dimensions: { width: 1000, height: 1400 } },
      { pageNumber: 5, imageUrl: page5Src, dimensions: { width: 1000, height: 1400 } },
    ] as unknown as PageImage[];

    const resolved = resolveExpandedImageForPage(verification, 3, pageImages);
    expect(resolved?.src).toBe(page3Src);
    // Page 3 is NOT the match page — should not inherit verification.document overrides
    expect(resolved?.renderScale).toBeNull();
    expect(resolved?.highlightBox).toBeNull();
  });

  it("suppresses keyhole expansion when image is at the 2.0x near-fit threshold", async () => {
    const onImageClick = jest.fn<() => void>();
    const { container } = render(
      <EvidenceTray verification={baseVerification} status={baseStatus} onImageClick={onImageClick} />,
    );

    setKeyholeViewportSize(container, 500, 100);
    fireKeyholeImageLoad(container, 800, 200);

    await waitFor(() => {
      const strip = container.querySelector("[data-dc-keyhole]");
      const button = strip?.closest("button");
      expect(button).toHaveAttribute("title", "Already full size" /* i18n default */);
    });

    clickKeyholeButton(container);
    expect(onImageClick).not.toHaveBeenCalled();
  });

  it("allows keyhole expansion when image exceeds the 2.0x near-fit threshold", async () => {
    const onImageClick = jest.fn<() => void>();
    const { container } = render(
      <EvidenceTray verification={baseVerification} status={baseStatus} onImageClick={onImageClick} />,
    );

    setKeyholeViewportSize(container, 500, 100);
    fireKeyholeImageLoad(container, 800, 201);

    await waitFor(() => {
      const strip = container.querySelector("[data-dc-keyhole]");
      const button = strip?.closest("button");
      expect(button).not.toHaveAttribute("title", "Already full size" /* i18n default */);
    });

    clickKeyholeButton(container);
    expect(onImageClick).toHaveBeenCalledTimes(1);
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

// =============================================================================
// InlineExpandedImage — "View page" CTA guard on onExpand prop
// =============================================================================

describe("InlineExpandedImage View page CTA", () => {
  beforeEach(() => {
    globalThis.ResizeObserver = jest.fn<(cb: ResizeObserverCallback) => ResizeObserver>().mockImplementation(() => ({
      observe: jest.fn<ResizeObserver["observe"]>(),
      unobserve: jest.fn<ResizeObserver["unobserve"]>(),
      disconnect: jest.fn<ResizeObserver["disconnect"]>(),
    })) as unknown as typeof ResizeObserver;
  });

  it("does not render 'View page' CTA when onExpand is not provided", () => {
    const { container } = render(
      <InlineExpandedImage src="https://proof.deepcitation.com/page1.avif" onCollapse={() => {}} />,
    );
    const viewPageBtn = container.querySelector("button[aria-label='View page']");
    expect(viewPageBtn).toBeNull();
  });

  it("renders 'View page' CTA when onExpand is provided", () => {
    const onExpand = jest.fn();
    const { container } = render(
      <InlineExpandedImage src="https://proof.deepcitation.com/page1.avif" onCollapse={() => {}} onExpand={onExpand} />,
    );
    const viewPageBtn = container.querySelector("button[aria-label='View page']");
    expect(viewPageBtn).not.toBeNull();
    viewPageBtn?.click();
    expect(onExpand).toHaveBeenCalledTimes(1);
  });
});
