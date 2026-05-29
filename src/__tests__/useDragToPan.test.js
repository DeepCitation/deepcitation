import { describe, expect, test } from "bun:test";
import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { useDragToPan } from "../react/hooks/useDragToPan";
describe("useDragToPan", () => {
    test("returns expected shape", () => {
        const { result } = renderHook(() => useDragToPan());
        expect(result.current.containerRef).toBeDefined();
        expect(result.current.isDragging).toBe(false);
        expect(result.current.handlers).toBeDefined();
        expect(typeof result.current.handlers.onMouseDown).toBe("function");
        expect(typeof result.current.handlers.onMouseMove).toBe("function");
        expect(typeof result.current.handlers.onMouseUp).toBe("function");
        expect(typeof result.current.handlers.onMouseLeave).toBe("function");
        expect(typeof result.current.scrollTo).toBe("function");
        expect(result.current.wasDraggingRef.current).toBe(false);
    });
    test("initial scroll state has all falsy values", () => {
        const { result } = renderHook(() => useDragToPan());
        expect(result.current.scrollState.scrollLeft).toBe(0);
        expect(result.current.scrollState.canScrollLeft).toBe(false);
        expect(result.current.scrollState.canScrollRight).toBe(false);
    });
    test("touchcancel clears drag state without suppressing the next click", () => {
        let hookApi = null;
        function Harness() {
            hookApi = useDragToPan({ direction: "xy" });
            return createElement("div", { ref: hookApi.containerRef, "data-testid": "target" }, createElement("div", { style: { width: "400px", height: "400px" } }));
        }
        const { getByTestId } = render(createElement(Harness));
        const target = getByTestId("target");
        if (!hookApi)
            throw new Error("hook did not initialize");
        Object.defineProperty(target, "clientWidth", { value: 200, configurable: true });
        Object.defineProperty(target, "clientHeight", { value: 200, configurable: true });
        Object.defineProperty(target, "scrollWidth", { value: 400, configurable: true });
        Object.defineProperty(target, "scrollHeight", { value: 400, configurable: true });
        act(() => {
            fireEvent.touchStart(target, { touches: [{ clientX: 0, clientY: 0 }] });
            fireEvent.touchMove(target, { touches: [{ clientX: -20, clientY: -20 }] });
            fireEvent.touchCancel(target, { touches: [] });
        });
        expect(hookApi.wasDraggingRef.current).toBe(false);
    });
});
