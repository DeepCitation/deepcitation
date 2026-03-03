import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useWheelZoom } from "../react/hooks/useWheelZoom";

// Tests use real timers with waitFor() because Bun's jest doesn't fully support
// timer advancement APIs (advanceTimersByTime, runAllTimers) in multi-file runs.

/** Create a mock container element with a bounding rect and scroll properties. */
function createMockContainer(): HTMLDivElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    width: 600,
    height: 400,
    top: 0,
    right: 600,
    bottom: 400,
    left: 0,
    toJSON: () => ({}),
  });
  Object.defineProperty(el, "scrollLeft", { value: 0, writable: true });
  Object.defineProperty(el, "scrollTop", { value: 0, writable: true });
  document.body.appendChild(el);
  return el;
}

/** Create a mock wrapper element for CSS transforms. */
function createMockWrapper(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

/** Dispatch a wheel event on the container. */
function fireWheel(el: HTMLElement, deltaY: number) {
  const event = new WheelEvent("wheel", {
    deltaY,
    deltaMode: 0,
    clientX: 300,
    clientY: 200,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
}

/** Wait for real-time milliseconds. */
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe("useWheelZoom", () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
  });

  it("returns expected shape", () => {
    const container = createMockContainer();
    const wrapper = createMockWrapper();

    const { result } = renderHook(() =>
      useWheelZoom({
        enabled: true,
        sensitivity: 0.005,
        containerRef: { current: container },
        wrapperRef: { current: wrapper },
        zoom: 1.0,
        clampZoomRaw: (z: number) => Math.max(0.5, Math.min(3.0, z)),
        clampZoom: (z: number) => Math.round(Math.max(0.5, Math.min(3.0, z)) * 100) / 100,
        onZoomCommit: () => {},
      }),
    );

    expect(typeof result.current.isHovering).toBe("boolean");
    expect(result.current.gestureAnchorRef).toBeDefined();
    expect(result.current.gestureZoomRef).toBeDefined();
    expect(result.current.gestureZoomRef.current).toBeNull();
  });

  it("commits zoom after 150ms debounce", async () => {
    const container = createMockContainer();
    const wrapper = createMockWrapper();
    const onZoomCommit = jest.fn<(z: number) => void>();

    renderHook(() =>
      useWheelZoom({
        enabled: true,
        sensitivity: 0.005,
        containerRef: { current: container },
        wrapperRef: { current: wrapper },
        zoom: 1.0,
        clampZoomRaw: (z: number) => Math.max(0.5, Math.min(3.0, z)),
        clampZoom: (z: number) => Math.round(Math.max(0.5, Math.min(3.0, z)) * 100) / 100,
        onZoomCommit,
      }),
    );

    // Fire a zoom-in wheel event (negative deltaY = zoom in)
    act(() => {
      fireWheel(container, -100);
    });

    // Before debounce: no commit yet
    expect(onZoomCommit).not.toHaveBeenCalled();

    // Wait for 150ms debounce to fire
    await waitFor(
      () => {
        expect(onZoomCommit).toHaveBeenCalledTimes(1);
      },
      { timeout: 500 },
    );

    expect(onZoomCommit.mock.calls[0][0]).toBeGreaterThan(1.0);
  });

  it("prevents snap-back when new gesture starts before React re-renders", async () => {
    const container = createMockContainer();
    const wrapper = createMockWrapper();

    // Track committed zoom values — intentionally do NOT re-render (simulating
    // the window between commit timeout and React's render).
    let lastCommittedZoom = 1.0;
    const onZoomCommit = jest.fn<(z: number) => void>().mockImplementation(z => {
      lastCommittedZoom = z;
    });

    const { result } = renderHook(() =>
      useWheelZoom({
        enabled: true,
        sensitivity: 0.005,
        containerRef: { current: container },
        wrapperRef: { current: wrapper },
        // zoom stays at 1.0 — simulates React not having re-rendered yet
        zoom: 1.0,
        clampZoomRaw: (z: number) => Math.max(0.5, Math.min(3.0, z)),
        clampZoom: (z: number) => Math.round(Math.max(0.5, Math.min(3.0, z)) * 100) / 100,
        onZoomCommit,
      }),
    );

    // First gesture: zoom in
    act(() => {
      fireWheel(container, -100);
    });

    // Wait for 150ms debounce — commit fires
    await waitFor(
      () => {
        expect(onZoomCommit).toHaveBeenCalledTimes(1);
      },
      { timeout: 500 },
    );

    const firstCommit = lastCommittedZoom;
    expect(firstCommit).toBeGreaterThan(1.0);

    // gestureZoomRef should be null after commit (gesture ended)
    expect(result.current.gestureZoomRef.current).toBeNull();

    // Start second gesture BEFORE React re-renders (zoom prop still 1.0).
    // Without committedZoomRef, this would snap back to zoom=1.0.
    act(() => {
      fireWheel(container, -50);
    });

    // The second gesture should build on top of firstCommit, not snap back to 1.0.
    const secondGestureZoom = result.current.gestureZoomRef.current;
    expect(secondGestureZoom).not.toBeNull();
    expect(secondGestureZoom!).toBeGreaterThanOrEqual(firstCommit);
  });

  it("uses committed zoom as CSS transform scale base during stale-prop window", async () => {
    const container = createMockContainer();
    const wrapper = createMockWrapper();

    let lastCommittedZoom = 1.0;
    const onZoomCommit = jest.fn<(z: number) => void>().mockImplementation(z => {
      lastCommittedZoom = z;
    });

    renderHook(() =>
      useWheelZoom({
        enabled: true,
        sensitivity: 0.005,
        containerRef: { current: container },
        wrapperRef: { current: wrapper },
        // zoom stays at 1.0 — simulates React not having re-rendered
        zoom: 1.0,
        clampZoomRaw: (z: number) => Math.max(0.5, Math.min(3.0, z)),
        clampZoom: (z: number) => Math.round(Math.max(0.5, Math.min(3.0, z)) * 100) / 100,
        onZoomCommit,
      }),
    );

    // First gesture: zoom in
    act(() => {
      fireWheel(container, -100);
    });

    // Wait for commit
    await waitFor(
      () => {
        expect(onZoomCommit).toHaveBeenCalledTimes(1);
      },
      { timeout: 500 },
    );

    const committed = lastCommittedZoom;
    expect(committed).toBeGreaterThan(1.0);

    // Second gesture while zoom prop is still 1.0 (stale).
    // The CSS transform scale should be relative to `committed`, not 1.0.
    act(() => {
      fireWheel(container, -50);
    });

    // Parse the scale value from the wrapper's CSS transform.
    const transform = wrapper.style.transform;
    const scaleMatch = transform.match(/scale\(([^)]+)\)/);
    expect(scaleMatch).not.toBeNull();
    const scale = Number.parseFloat(scaleMatch?.[1] ?? "0");

    // If the hook incorrectly used stale zoom (1.0) as the base, the scale
    // would be gestureZoom/1.0 — much larger than gestureZoom/committed.
    // The correct scale should be close to 1.0 (small adjustment from committed).
    // A stale base would produce a scale > committed (e.g. ~1.5/1.0 = 1.5 vs ~1.5/1.5 ≈ 1.0).
    expect(scale).toBeLessThan(committed);
  });

  it("does not intercept horizontal-only wheel events", async () => {
    const container = createMockContainer();
    const wrapper = createMockWrapper();
    const onZoomCommit = jest.fn<(z: number) => void>();

    const { result } = renderHook(() =>
      useWheelZoom({
        enabled: true,
        sensitivity: 0.005,
        containerRef: { current: container },
        wrapperRef: { current: wrapper },
        zoom: 1.0,
        clampZoomRaw: (z: number) => Math.max(0.5, Math.min(3.0, z)),
        clampZoom: (z: number) => Math.round(Math.max(0.5, Math.min(3.0, z)) * 100) / 100,
        onZoomCommit,
      }),
    );

    // Horizontal-only scroll (deltaY = 0)
    act(() => {
      const event = new WheelEvent("wheel", {
        deltaY: 0,
        deltaX: 100,
        deltaMode: 0,
        bubbles: true,
        cancelable: true,
      });
      container.dispatchEvent(event);
    });

    // Should not start a gesture
    expect(result.current.gestureZoomRef.current).toBeNull();

    // Wait to ensure no commit fires
    await delay(200);
    expect(onZoomCommit).not.toHaveBeenCalled();
  });
});
