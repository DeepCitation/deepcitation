import { renderHook, act } from "@testing-library/react";
import { useRepositionGracePeriod } from "../react/hooks/useRepositionGracePeriod.js";

describe("useRepositionGracePeriod", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("should initialize with grace period inactive", () => {
    const { result } = renderHook(() => useRepositionGracePeriod(false, true, 300));

    expect(result.current.isInGracePeriod.current).toBe(false);
  });

  it("should activate grace period when content expands while popover is open", () => {
    const { result, rerender } = renderHook(
      ({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300),
      {
        initialProps: { contentExpanded: false, isOpen: true },
      },
    );

    // Initially not in grace period
    expect(result.current.isInGracePeriod.current).toBe(false);

    // Expand content
    rerender({ contentExpanded: true, isOpen: true });

    // Grace period should be active
    expect(result.current.isInGracePeriod.current).toBe(true);
  });

  it("should NOT activate grace period when content changes but popover is closed", () => {
    const { result, rerender } = renderHook(
      ({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300),
      {
        initialProps: { contentExpanded: false, isOpen: false },
      },
    );

    // Expand content while popover is closed
    rerender({ contentExpanded: true, isOpen: false });

    // Grace period should NOT be active
    expect(result.current.isInGracePeriod.current).toBe(false);
  });

  it("should deactivate grace period after timeout expires", () => {
    const gracePeriodMs = 300;
    const { result, rerender } = renderHook(
      ({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, gracePeriodMs),
      {
        initialProps: { contentExpanded: false, isOpen: true },
      },
    );

    // Expand content to activate grace period
    rerender({ contentExpanded: true, isOpen: true });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Fast-forward time just before grace period expires
    act(() => {
      jest.advanceTimersByTime(gracePeriodMs - 10);
    });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Fast-forward to grace period expiration
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(result.current.isInGracePeriod.current).toBe(false);
  });

  it("should clear grace period when clearGracePeriod is called", () => {
    const { result, rerender } = renderHook(
      ({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300),
      {
        initialProps: { contentExpanded: false, isOpen: true },
      },
    );

    // Activate grace period
    rerender({ contentExpanded: true, isOpen: true });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Manually clear grace period (simulates cursor re-entering popover)
    act(() => {
      result.current.clearGracePeriod();
    });

    expect(result.current.isInGracePeriod.current).toBe(false);
  });

  it("should clear grace period when popover closes", () => {
    const { result, rerender } = renderHook(
      ({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300),
      {
        initialProps: { contentExpanded: false, isOpen: true },
      },
    );

    // Activate grace period
    rerender({ contentExpanded: true, isOpen: true });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Close popover
    rerender({ contentExpanded: true, isOpen: false });

    // Grace period should be cleared
    expect(result.current.isInGracePeriod.current).toBe(false);
  });

  it("should handle rapid expand/collapse by resetting the timer", () => {
    const gracePeriodMs = 300;
    const { result, rerender } = renderHook(
      ({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, gracePeriodMs),
      {
        initialProps: { contentExpanded: false, isOpen: true },
      },
    );

    // First expansion
    rerender({ contentExpanded: true, isOpen: true });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Advance time partway through grace period
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Collapse (triggers new grace period)
    rerender({ contentExpanded: false, isOpen: true });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // The timer should reset - advance another 150ms (total 300ms from first expansion)
    act(() => {
      jest.advanceTimersByTime(150);
    });
    // Should STILL be in grace period (timer was reset)
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Advance another 150ms to complete the new grace period
    act(() => {
      jest.advanceTimersByTime(150);
    });
    // Now grace period should expire
    expect(result.current.isInGracePeriod.current).toBe(false);
  });

  it("should cleanup timer on unmount", () => {
    const { result, rerender, unmount } = renderHook(
      ({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300),
      {
        initialProps: { contentExpanded: false, isOpen: true },
      },
    );

    // Activate grace period
    rerender({ contentExpanded: true, isOpen: true });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Unmount
    unmount();

    // Verify no timers are pending (cleanup worked)
    expect(jest.getTimerCount()).toBe(0);
  });

  it("should support custom grace period duration", () => {
    const customGracePeriodMs = 500;
    const { result, rerender } = renderHook(
      ({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, customGracePeriodMs),
      {
        initialProps: { contentExpanded: false, isOpen: true },
      },
    );

    // Activate grace period
    rerender({ contentExpanded: true, isOpen: true });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Advance time just before custom grace period expires
    act(() => {
      jest.advanceTimersByTime(customGracePeriodMs - 10);
    });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Complete the custom grace period
    act(() => {
      jest.advanceTimersByTime(20);
    });
    expect(result.current.isInGracePeriod.current).toBe(false);
  });

  it("should not activate grace period on initial mount", () => {
    // Mount with contentExpanded=true from the start
    const { result } = renderHook(() => useRepositionGracePeriod(true, true, 300));

    // Grace period should NOT be active (no change occurred)
    expect(result.current.isInGracePeriod.current).toBe(false);
  });

  it("should handle reopening popover with cleared grace period", () => {
    const { result, rerender } = renderHook(
      ({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300),
      {
        initialProps: { contentExpanded: false, isOpen: true },
      },
    );

    // Activate grace period
    rerender({ contentExpanded: true, isOpen: true });
    expect(result.current.isInGracePeriod.current).toBe(true);

    // Close popover
    rerender({ contentExpanded: true, isOpen: false });
    expect(result.current.isInGracePeriod.current).toBe(false);

    // Reopen popover
    rerender({ contentExpanded: true, isOpen: true });

    // Grace period should NOT be active (no content change, just reopening)
    expect(result.current.isInGracePeriod.current).toBe(false);
  });
});
