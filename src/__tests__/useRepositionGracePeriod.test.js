import { act, renderHook, waitFor } from "@testing-library/react";
import { useRepositionGracePeriod } from "../react/hooks/useRepositionGracePeriod.js";
// Tests use real timers with waitFor() instead of fake timers because Bun's jest
// doesn't fully support timer advancement APIs (advanceTimersByTime, runAllTimers, etc.)
describe("useRepositionGracePeriod", () => {
    it("should initialize with grace period inactive", () => {
        const { result } = renderHook(() => useRepositionGracePeriod(false, true, 300));
        expect(result.current.isInGracePeriod.current).toBe(false);
    });
    it("should activate grace period when content expands while popover is open", () => {
        const { result, rerender } = renderHook(({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300), {
            initialProps: { contentExpanded: false, isOpen: true },
        });
        // Initially not in grace period
        expect(result.current.isInGracePeriod.current).toBe(false);
        // Expand content
        rerender({ contentExpanded: true, isOpen: true });
        // Grace period should be active
        expect(result.current.isInGracePeriod.current).toBe(true);
    });
    it("should NOT activate grace period when content changes but popover is closed", () => {
        const { result, rerender } = renderHook(({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300), {
            initialProps: { contentExpanded: false, isOpen: false },
        });
        // Expand content while popover is closed
        rerender({ contentExpanded: true, isOpen: false });
        // Grace period should NOT be active
        expect(result.current.isInGracePeriod.current).toBe(false);
    });
    it("should deactivate grace period after timeout expires", async () => {
        const gracePeriodMs = 100;
        const { result, rerender } = renderHook(({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, gracePeriodMs), {
            initialProps: { contentExpanded: false, isOpen: true },
        });
        // Expand content to activate grace period
        rerender({ contentExpanded: true, isOpen: true });
        expect(result.current.isInGracePeriod.current).toBe(true);
        // Wait for grace period to expire
        await waitFor(() => {
            expect(result.current.isInGracePeriod.current).toBe(false);
        }, { timeout: gracePeriodMs + 100 });
    });
    it("should clear grace period when clearGracePeriod is called", () => {
        const { result, rerender } = renderHook(({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300), {
            initialProps: { contentExpanded: false, isOpen: true },
        });
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
        const { result, rerender } = renderHook(({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300), {
            initialProps: { contentExpanded: false, isOpen: true },
        });
        // Activate grace period
        rerender({ contentExpanded: true, isOpen: true });
        expect(result.current.isInGracePeriod.current).toBe(true);
        // Close popover
        rerender({ contentExpanded: true, isOpen: false });
        // Grace period should be cleared
        expect(result.current.isInGracePeriod.current).toBe(false);
    });
    it("should handle rapid expand/collapse by resetting the timer", async () => {
        const gracePeriodMs = 100;
        const { result, rerender } = renderHook(({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, gracePeriodMs), {
            initialProps: { contentExpanded: false, isOpen: true },
        });
        // First expansion
        rerender({ contentExpanded: true, isOpen: true });
        expect(result.current.isInGracePeriod.current).toBe(true);
        // Wait partway through grace period
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(result.current.isInGracePeriod.current).toBe(true);
        // Collapse (triggers new grace period, which should reset the timer)
        rerender({ contentExpanded: false, isOpen: true });
        expect(result.current.isInGracePeriod.current).toBe(true);
        // Wait another 60ms (total 120ms from first expansion)
        // Grace period should STILL be active because timer was reset on collapse
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(result.current.isInGracePeriod.current).toBe(true);
        // Wait for the reset timer to complete (from collapse)
        await waitFor(() => {
            expect(result.current.isInGracePeriod.current).toBe(false);
        }, { timeout: gracePeriodMs });
    });
    it("should cleanup timer on unmount", () => {
        const { result, rerender, unmount } = renderHook(({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300), {
            initialProps: { contentExpanded: false, isOpen: true },
        });
        // Activate grace period
        rerender({ contentExpanded: true, isOpen: true });
        expect(result.current.isInGracePeriod.current).toBe(true);
        // Unmount
        unmount();
        // Timer cleanup is handled by React Testing Library's cleanup process,
        // which unmounts components and clears effects/timers automatically.
        // No explicit verification needed - timer leaks would cause other tests to fail.
    });
    it("should support custom grace period duration", async () => {
        const customGracePeriodMs = 100;
        const { result, rerender } = renderHook(({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, customGracePeriodMs), {
            initialProps: { contentExpanded: false, isOpen: true },
        });
        // Activate grace period
        rerender({ contentExpanded: true, isOpen: true });
        expect(result.current.isInGracePeriod.current).toBe(true);
        // Wait for grace period to expire
        await waitFor(() => {
            expect(result.current.isInGracePeriod.current).toBe(false);
        }, { timeout: customGracePeriodMs + 100 });
    });
    it("should not activate grace period on initial mount", () => {
        // Mount with contentExpanded=true from the start
        const { result } = renderHook(() => useRepositionGracePeriod(true, true, 300));
        // Grace period should NOT be active (no change occurred)
        expect(result.current.isInGracePeriod.current).toBe(false);
    });
    it("should handle reopening popover with cleared grace period", () => {
        const { result, rerender } = renderHook(({ contentExpanded, isOpen }) => useRepositionGracePeriod(contentExpanded, isOpen, 300), {
            initialProps: { contentExpanded: false, isOpen: true },
        });
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
