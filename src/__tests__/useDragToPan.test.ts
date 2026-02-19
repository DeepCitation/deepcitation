import { describe, expect, test } from "@jest/globals";
import { renderHook } from "@testing-library/react";
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
    expect(result.current.wasDragging.current).toBe(false);
  });

  test("initial scroll state has all falsy values", () => {
    const { result } = renderHook(() => useDragToPan());
    expect(result.current.scrollState.scrollLeft).toBe(0);
    expect(result.current.scrollState.canScrollLeft).toBe(false);
    expect(result.current.scrollState.canScrollRight).toBe(false);
  });

  test("isDragging is false initially", () => {
    const { result } = renderHook(() => useDragToPan());
    expect(result.current.isDragging).toBe(false);
  });

  test("wasDragging is false initially", () => {
    const { result } = renderHook(() => useDragToPan());
    expect(result.current.wasDragging.current).toBe(false);
  });
});
