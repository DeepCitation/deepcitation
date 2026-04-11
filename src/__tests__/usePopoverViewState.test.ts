import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, renderHook } from "@testing-library/react";

// Mock external dependencies that touch the DOM
const mockAcquireScrollLock = jest.fn();
const mockReleaseScrollLock = jest.fn();
const mockStartEvidenceViewTransition = jest.fn((cb: () => void) => cb());
const mockStartEvidencePageExpandTransition = jest.fn((cb: () => void) => cb());
const mockStartEvidencePageCollapseTransition = jest.fn((cb: () => void) => cb());
const mockTriggerHaptic = jest.fn();

jest.mock("../react/scrollLock", () => ({
  acquireScrollLock: mockAcquireScrollLock,
  releaseScrollLock: mockReleaseScrollLock,
}));

jest.mock("../react/viewTransition", () => ({
  startEvidenceViewTransition: mockStartEvidenceViewTransition,
  startEvidencePageExpandTransition: mockStartEvidencePageExpandTransition,
  startEvidencePageCollapseTransition: mockStartEvidencePageCollapseTransition,
}));

jest.mock("../react/haptics", () => ({
  triggerHaptic: mockTriggerHaptic,
}));

import { type UsePopoverViewStateConfig, usePopoverViewState } from "../react/hooks/usePopoverViewState";

function createConfig(overrides: Partial<UsePopoverViewStateConfig> = {}): UsePopoverViewStateConfig {
  return {
    isOpen: true,
    popoverContentRef: { current: null },
    ...overrides,
  };
}

beforeEach(() => {
  mockAcquireScrollLock.mockClear();
  mockReleaseScrollLock.mockClear();
  mockStartEvidenceViewTransition.mockClear();
  mockStartEvidencePageExpandTransition.mockClear();
  mockStartEvidencePageCollapseTransition.mockClear();
  mockTriggerHaptic.mockClear();
  cleanup();
});

describe("usePopoverViewState", () => {
  it("starts in summary state", () => {
    const { result } = renderHook(() => usePopoverViewState(createConfig()));
    expect(result.current.current).toBe("summary");
    expect(result.current.expandedNaturalWidth).toBeNull();
    expect(result.current.expandedWidthSource).toBeNull();
  });

  describe("transition", () => {
    it("transitions from summary to expanded-keyhole", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-keyhole"));
      expect(result.current.current).toBe("expanded-keyhole");
    });

    it("transitions from summary to expanded-page via page expand VT", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-page"));
      expect(result.current.current).toBe("expanded-page");
      expect(mockStartEvidencePageExpandTransition).toHaveBeenCalledTimes(1);
    });

    it("uses collapse VT when going from expanded-keyhole to summary", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.transition("summary"));
      expect(result.current.current).toBe("summary");
      // The second transition is a collapse — uses startEvidenceViewTransition with isCollapse
      expect(mockStartEvidenceViewTransition).toHaveBeenCalled();
    });

    it("uses page collapse VT when going from expanded-page to summary", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-page"));
      mockStartEvidencePageCollapseTransition.mockClear();
      mockStartEvidencePageExpandTransition.mockClear();
      act(() => result.current.transition("summary"));
      expect(result.current.current).toBe("summary");
      expect(mockStartEvidencePageCollapseTransition).toHaveBeenCalledTimes(1);
      expect(mockStartEvidencePageExpandTransition).not.toHaveBeenCalled();
    });

    it("uses page collapse VT when going from expanded-page to expanded-keyhole", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.transition("expanded-page"));
      mockStartEvidencePageCollapseTransition.mockClear();
      mockStartEvidenceViewTransition.mockClear();
      act(() => result.current.transition("expanded-keyhole"));
      expect(result.current.current).toBe("expanded-keyhole");
      expect(mockStartEvidencePageCollapseTransition).toHaveBeenCalledTimes(1);
      expect(mockStartEvidenceViewTransition).not.toHaveBeenCalled();
    });

    it("calls onCollapseToSummary when transitioning to summary", () => {
      const onCollapse = jest.fn();
      const { result } = renderHook(() => usePopoverViewState(createConfig({ onCollapseToSummary: onCollapse })));
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.transition("summary"));
      expect(onCollapse).toHaveBeenCalledTimes(1);
    });

    it("clears expanded width state when transitioning to summary", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.onExpandedWidthChange(400));
      expect(result.current.expandedNaturalWidth).toBe(400);
      act(() => result.current.transition("summary"));
      expect(result.current.expandedNaturalWidth).toBeNull();
      expect(result.current.expandedWidthSource).toBeNull();
    });
  });

  describe("escape key handling", () => {
    it("calls onDismiss from summary state", () => {
      const onDismiss = jest.fn();
      const { result } = renderHook(() => usePopoverViewState(createConfig({ onDismiss })));
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      act(() => result.current.onEscapeKeyDown(event));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("navigates back from expanded-page to prevBeforeExpandedPage", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      // Go to expanded-keyhole first, then expanded-page
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.transition("expanded-page"));
      expect(result.current.current).toBe("expanded-page");
      // Escape should go back to expanded-keyhole (the state before expanded-page)
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      act(() => result.current.onEscapeKeyDown(event));
      expect(result.current.current).toBe("expanded-keyhole");
    });

    it("navigates from expanded-keyhole to summary on escape", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-keyhole"));
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      act(() => result.current.onEscapeKeyDown(event));
      expect(result.current.current).toBe("summary");
    });

    it("delegates to escapeInterceptRef when set", () => {
      const interceptor = jest.fn();
      const onDismiss = jest.fn();
      const { result } = renderHook(() => usePopoverViewState(createConfig({ onDismiss })));
      result.current.escapeInterceptRef.current = interceptor;
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      act(() => result.current.onEscapeKeyDown(event));
      expect(interceptor).toHaveBeenCalledTimes(1);
      expect(onDismiss).not.toHaveBeenCalled();
    });
  });

  describe("scroll lock", () => {
    it("acquires scroll lock when open and in expanded-page", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig({ isOpen: true })));
      act(() => result.current.transition("expanded-page"));
      expect(mockAcquireScrollLock).toHaveBeenCalledTimes(1);
    });

    it("does not acquire scroll lock in summary state", () => {
      renderHook(() => usePopoverViewState(createConfig({ isOpen: true })));
      expect(mockAcquireScrollLock).not.toHaveBeenCalled();
    });

    it("does not acquire scroll lock when not open", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig({ isOpen: false })));
      act(() => result.current.transition("expanded-page"));
      expect(mockAcquireScrollLock).not.toHaveBeenCalled();
    });
  });

  describe("resetToSummary", () => {
    it("resets view state and clears width state", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.onExpandedWidthChange(500));
      act(() => result.current.resetToSummary());
      expect(result.current.current).toBe("summary");
      expect(result.current.expandedNaturalWidth).toBeNull();
      expect(result.current.expandedWidthSource).toBeNull();
    });

    it("does not fire onCollapseToSummary", () => {
      const onCollapse = jest.fn();
      const { result } = renderHook(() => usePopoverViewState(createConfig({ onCollapseToSummary: onCollapse })));
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.resetToSummary());
      expect(onCollapse).not.toHaveBeenCalled();
    });

    it("resets prevBeforeExpandedPageRef so next session starts clean", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      // Session 1: drill into expanded-page via expanded-keyhole
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.transition("expanded-page"));
      expect(result.current.prevBeforeExpandedPageRef.current).toBe("expanded-keyhole");
      // Simulate popover close + reopen
      act(() => result.current.resetToSummary());
      expect(result.current.prevBeforeExpandedPageRef.current).toBe("summary");
      // Session 2: go directly to expanded-page, escape should land on summary
      act(() => result.current.transition("expanded-page"));
      const event = new KeyboardEvent("keydown", { key: "Escape" });
      act(() => result.current.onEscapeKeyDown(event));
      expect(result.current.current).toBe("summary");
    });
  });

  describe("onExpandedWidthChange", () => {
    it("stores width and source when in expanded state", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.onExpandedWidthChange(350));
      expect(result.current.expandedNaturalWidth).toBe(350);
      expect(result.current.expandedWidthSource).toBe("expanded-keyhole");
    });

    it("clears width when source override is not an expanded state", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.onExpandedWidthChange(350));
      act(() => result.current.onExpandedWidthChange(null, "summary" as any));
      expect(result.current.expandedNaturalWidth).toBeNull();
    });

    it("respects source override parameter", () => {
      const { result } = renderHook(() => usePopoverViewState(createConfig()));
      act(() => result.current.transition("expanded-keyhole"));
      act(() => result.current.onExpandedWidthChange(400, "expanded-page"));
      expect(result.current.expandedWidthSource).toBe("expanded-page");
    });
  });

  describe("haptics", () => {
    it("fires expand haptic when going from summary to expanded-page", () => {
      const { result } = renderHook(() =>
        usePopoverViewState(createConfig({ experimentalHaptics: true, isMobile: true })),
      );
      act(() => result.current.transition("expanded-page"));
      expect(mockTriggerHaptic).toHaveBeenCalledWith("expand");
    });

    it("fires collapse haptic when going from expanded-keyhole to summary", () => {
      const { result } = renderHook(() =>
        usePopoverViewState(createConfig({ experimentalHaptics: true, isMobile: true })),
      );
      act(() => result.current.transition("expanded-keyhole"));
      mockTriggerHaptic.mockClear();
      act(() => result.current.transition("summary"));
      expect(mockTriggerHaptic).toHaveBeenCalledWith("collapse");
    });

    it("does not fire haptics when experimentalHaptics is false", () => {
      const { result } = renderHook(() =>
        usePopoverViewState(createConfig({ experimentalHaptics: false, isMobile: true })),
      );
      act(() => result.current.transition("expanded-page"));
      expect(mockTriggerHaptic).not.toHaveBeenCalled();
    });

    it("does not fire haptics for intermediate transitions", () => {
      const { result } = renderHook(() =>
        usePopoverViewState(createConfig({ experimentalHaptics: true, isMobile: true })),
      );
      act(() => result.current.transition("expanded-keyhole"));
      mockTriggerHaptic.mockClear();
      // expanded-keyhole → expanded-page is intermediate, no haptic
      act(() => result.current.transition("expanded-page"));
      expect(mockTriggerHaptic).not.toHaveBeenCalled();
    });
  });

  describe("handle stability", () => {
    it("returns a stable handle object when state has not changed", () => {
      // Use a stable config object so the ref identity doesn't change across rerenders
      const stableConfig = createConfig();
      const { result, rerender } = renderHook(() => usePopoverViewState(stableConfig));
      const handle1 = result.current;
      rerender();
      const handle2 = result.current;
      expect(handle1).toBe(handle2);
    });

    it("returns stable function references across rerenders", () => {
      const stableConfig = createConfig();
      const { result, rerender } = renderHook(() => usePopoverViewState(stableConfig));
      const transition1 = result.current.transition;
      const resetToSummary1 = result.current.resetToSummary;
      const onEscapeKeyDown1 = result.current.onEscapeKeyDown;
      rerender();
      expect(result.current.transition).toBe(transition1);
      expect(result.current.resetToSummary).toBe(resetToSummary1);
      expect(result.current.onEscapeKeyDown).toBe(onEscapeKeyDown1);
    });
  });
});
