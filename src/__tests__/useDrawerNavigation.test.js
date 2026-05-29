import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useDrawerNavigation } from "../react/hooks/useDrawerNavigation";
const FAKE_KEY_TO_PAGE = new Map();
function setup(onClose = mock(() => { })) {
    return renderHook(() => useDrawerNavigation({ isBottomSheet: true, keyToPage: FAKE_KEY_TO_PAGE, onClose }));
}
function pressEscape() {
    act(() => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
}
afterEach(() => {
    cleanup();
});
describe("useDrawerNavigation — initial state", () => {
    it("starts with all state cleared", () => {
        const { result } = setup();
        expect(result.current.expandedCitationKey).toBeNull();
        expect(result.current.headerInline).toBeNull();
        expect(result.current.activeIndicatorKey).toBeNull();
        expect(result.current.isFullPage).toBe(false);
    });
});
describe("useDrawerNavigation — toggleItem", () => {
    it("expands an item", () => {
        const { result } = setup();
        act(() => result.current.toggleItem("k1"));
        expect(result.current.expandedCitationKey).toBe("k1");
    });
    it("collapses the same item when toggled again", () => {
        const { result } = setup();
        act(() => result.current.toggleItem("k1"));
        act(() => result.current.toggleItem("k1"));
        expect(result.current.expandedCitationKey).toBeNull();
    });
    it("switches to a different item", () => {
        const { result } = setup();
        act(() => result.current.toggleItem("k1"));
        act(() => result.current.toggleItem("k2"));
        expect(result.current.expandedCitationKey).toBe("k2");
    });
});
describe("useDrawerNavigation — toggleActiveIndicator", () => {
    it("sets the active indicator key", () => {
        const { result } = setup();
        act(() => result.current.toggleActiveIndicator("k1"));
        expect(result.current.activeIndicatorKey).toBe("k1");
    });
    it("clears the active indicator key when toggled again", () => {
        const { result } = setup();
        act(() => result.current.toggleActiveIndicator("k1"));
        act(() => result.current.toggleActiveIndicator("k1"));
        expect(result.current.activeIndicatorKey).toBeNull();
    });
});
describe("useDrawerNavigation — closeInline / handlePageDeactivate", () => {
    it("closeInline resets header, indicator, and fullPage flag", () => {
        const { result } = setup();
        act(() => result.current.onInlineExpand("k1", "src.jpg", null, null, 1));
        act(() => result.current.toggleActiveIndicator("k1"));
        act(() => result.current.onManualExpand());
        act(() => result.current.closeInline());
        expect(result.current.headerInline).toBeNull();
        expect(result.current.activeIndicatorKey).toBeNull();
        expect(result.current.isFullPage).toBe(false);
    });
    it("handlePageDeactivate is identical to closeInline", () => {
        const { result } = setup();
        expect(result.current.handlePageDeactivate).toBe(result.current.closeInline);
    });
});
describe("useDrawerNavigation — Escape key cascade", () => {
    it("Level 3 → 2: Escape closes inline header without collapsing accordion", () => {
        const onClose = mock(() => { });
        const { result } = setup(onClose);
        act(() => result.current.toggleItem("k1"));
        act(() => result.current.onInlineExpand("k1", "src.jpg", null, null, 1));
        pressEscape();
        expect(result.current.headerInline).toBeNull();
        expect(result.current.expandedCitationKey).toBe("k1");
        expect(onClose).not.toHaveBeenCalled();
    });
    it("Level 2 → 1: Escape collapses accordion when no inline header is open", () => {
        const onClose = mock(() => { });
        const { result } = setup(onClose);
        act(() => result.current.toggleItem("k1"));
        pressEscape();
        expect(result.current.expandedCitationKey).toBeNull();
        expect(onClose).not.toHaveBeenCalled();
    });
    it("Level 1 → closed: Escape calls onClose when drawer is at base level", () => {
        const onClose = mock(() => { });
        setup(onClose);
        pressEscape();
        expect(onClose).toHaveBeenCalledTimes(1);
    });
    it("full 3-level cascade: Escape steps back through all levels", () => {
        const onClose = mock(() => { });
        const { result } = setup(onClose);
        // Level 3
        act(() => result.current.toggleItem("k1"));
        act(() => result.current.onInlineExpand("k1", "src.jpg", null, null, 1));
        pressEscape(); // → Level 2
        expect(result.current.headerInline).toBeNull();
        expect(result.current.expandedCitationKey).toBe("k1");
        pressEscape(); // → Level 1
        expect(result.current.expandedCitationKey).toBeNull();
        pressEscape(); // → closed
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
describe("useDrawerNavigation — event listener cleanup", () => {
    it("removes the keydown listener on unmount", () => {
        const onClose = mock(() => { });
        const removeSpy = spyOn(document, "removeEventListener");
        const { unmount } = setup(onClose);
        unmount();
        expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
        removeSpy.mockRestore();
    });
});
describe("useDrawerNavigation — isFullPage", () => {
    it("becomes true when inline header is open (bottom sheet)", () => {
        const { result } = setup();
        act(() => result.current.onInlineExpand("k1", "src.jpg"));
        expect(result.current.isFullPage).toBe(true);
    });
    it("becomes true on manual expand (bottom sheet)", () => {
        const { result } = setup();
        act(() => result.current.onManualExpand());
        expect(result.current.isFullPage).toBe(true);
    });
    it("is false when not a bottom sheet", () => {
        const { result } = renderHook(() => useDrawerNavigation({ isBottomSheet: false, keyToPage: FAKE_KEY_TO_PAGE, onClose: mock(() => { }) }));
        act(() => result.current.onInlineExpand("k1", "src.jpg"));
        expect(result.current.isFullPage).toBe(false);
    });
});
