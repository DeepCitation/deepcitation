/**
 * Tests for useViewportBoundaryGuard — specifically the isViewStateTransitionRef
 * flag that controls whether the safety timer skips vertical correction.
 *
 * Key regression: when transitioning out of expanded-page (CDN), sideOffset
 * changes from N → undefined in a second layout-effect run within the same
 * flushSync batch. The old code set isViewStateTransitionRef.current = isViewStateChange
 * which overwrote true→false on the second run, causing the safety timer to apply
 * full vertical correction mid-animation (skipVertical=false instead of true).
 *
 * Observable proxy: make the popover element overflow BOTH horizontally (left=-10)
 * and vertically (top=-20). With VIEWPORT_MARGIN_PX=16 and topInset=0:
 *   guardClamp → dx=26, dy=20
 *   skipVertical=true  → translate "26px"      (horizontal only)
 *   skipVertical=false → translate "26px 20px"  (both)
 *
 * After advanceTimersByTime(200), the last write to style.translate comes from
 * the safety timer (fires at SETTLE_MS≈136ms), which is what we're asserting.
 */
import { afterEach, beforeEach, describe, expect, it, jest, spyOn } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useViewportBoundaryGuard } from "../react/hooks/useViewportBoundaryGuard";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Creates a div whose getBoundingClientRect overflows both left and top so
 * guardClamp produces a visible dy when skipVertical=false.
 *
 * With clientWidth=1024, innerHeight=768, VIEWPORT_MARGIN_PX=16:
 *   dx = 16 − (−10) = 26   (left overflow)
 *   dy = 0  − (−20) = 20   (top overflow, only when skipVertical=false)
 */
function makeOutOfBoundsEl() {
    const el = document.createElement("div");
    spyOn(el, "getBoundingClientRect").mockReturnValue({
        left: -10,
        top: -20,
        right: 290,
        bottom: 380,
        width: 300,
        height: 400,
        x: -10,
        y: -20,
        toJSON: () => ({}),
    });
    return el;
}
function makeRefs(el) {
    return {
        popoverContentRef: { current: el },
        triggerRef: { current: document.createElement("span") },
    };
}
// skipVertical=true  → only dx applied
const HORIZONTAL_ONLY = "26px";
// skipVertical=false → dx and dy applied
const HORIZONTAL_AND_VERTICAL = "26px 20px";
function renderGuard(el, initialProps) {
    const { popoverContentRef, triggerRef } = makeRefs(el);
    return renderHook(({ popoverViewState, sideOffset }) => useViewportBoundaryGuard(true, popoverViewState, popoverContentRef, triggerRef, sideOffset), { initialProps });
}
// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
    jest.useFakeTimers();
    // Provide realistic viewport dimensions for predictable guardClamp output.
    Object.defineProperty(document.documentElement, "clientWidth", {
        value: 1024,
        writable: true,
        configurable: true,
    });
    Object.defineProperty(window, "innerHeight", {
        value: 768,
        writable: true,
        configurable: true,
    });
});
afterEach(() => {
    jest.useRealTimers();
    cleanup();
});
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("useViewportBoundaryGuard — safety-timer skipVertical flag", () => {
    it("skips vertical correction in safety timer on a plain view-state transition", () => {
        const el = makeOutOfBoundsEl();
        const { rerender } = renderGuard(el, { popoverViewState: "expanded-page", sideOffset: -184 });
        // Transition: expanded-page → summary in one re-render
        act(() => rerender({ popoverViewState: "summary", sideOffset: undefined }));
        // Advance past SETTLE_MS (≈136ms) so the safety timer fires
        act(() => jest.advanceTimersByTime(200));
        // isViewStateChange=true → isViewStateTransitionRef set to true →
        // safety timer uses skipVertical=true → horizontal correction only
        expect(el.style.translate).toBe(HORIZONTAL_ONLY);
    });
    it("still skips vertical when sideOffset changes in the same batch as the view-state change (CDN scenario)", () => {
        const el = makeOutOfBoundsEl();
        const { rerender } = renderGuard(el, { popoverViewState: "expanded-page", sideOffset: -184 });
        // Simulate the CDN flushSync double-render:
        //   render 1 → viewState changes to "summary" (layout effect: isViewStateChange=true → flag=true)
        //   render 2 → sideOffset clears to undefined  (layout effect: isViewStateChange=false → must NOT overwrite flag)
        // Both within one act() so passive effects (useEffect) flush only after both commits.
        act(() => {
            rerender({ popoverViewState: "summary", sideOffset: -184 }); // render 1
            rerender({ popoverViewState: "summary", sideOffset: undefined }); // render 2
        });
        act(() => jest.advanceTimersByTime(200));
        // The sideOffset-change layout-effect run must not have clobbered the flag.
        // Safety timer must still use skipVertical=true.
        expect(el.style.translate).toBe(HORIZONTAL_ONLY);
    });
    it("applies full (vertical+horizontal) correction for initial open — no transition", () => {
        const el = makeOutOfBoundsEl();
        // Render directly in summary state with no prior transition; flag starts false.
        renderGuard(el, { popoverViewState: "summary", sideOffset: undefined });
        act(() => jest.advanceTimersByTime(200));
        // No view-state transition → isViewStateTransitionRef stays false →
        // safety timer uses skipVertical=false → both dx and dy applied
        expect(el.style.translate).toBe(HORIZONTAL_AND_VERTICAL);
    });
    it("resets the flag so subsequent non-transition renders use full correction", () => {
        const el = makeOutOfBoundsEl();
        const { rerender } = renderGuard(el, { popoverViewState: "expanded-page", sideOffset: -184 });
        // First transition: expanded-page → summary (flag set to true, consumed & reset by useEffect)
        act(() => {
            rerender({ popoverViewState: "summary", sideOffset: -184 });
            rerender({ popoverViewState: "summary", sideOffset: undefined });
        });
        act(() => jest.advanceTimersByTime(200)); // fires safety timer, resets flag to false
        // Simulate sideOffset changing again with NO view-state change (e.g. window resize).
        // Flag is now false. The useEffect does NOT re-run (popoverViewState unchanged).
        // The layout effect for sideOffset runs clamp(skipVertical=false) directly —
        // no safety timer involved. Clear the style first so the layout-effect write is observable.
        el.style.translate = "";
        act(() => rerender({ popoverViewState: "summary", sideOffset: 8 }));
        // The sideOffset-only layout effect calls clamp(skipVertical=false) directly —
        // no safety timer involved here. Assert both dx and dy are applied:
        expect(el.style.translate).toBe(HORIZONTAL_AND_VERTICAL);
    });
});
