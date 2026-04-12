import { describe, expect, test } from "@jest/globals";
import { buildGhostTargetFromViewport } from "../react/viewTransition";
import type { GhostSnapshot } from "../react/viewTransition";

// Regression guard for the miss/not_found ghost scale-up bug (fix/miss-keyhole-page-expand-scale).
//
// Before the fix, `buildGhostTargetFromViewport` returned `ghostRect = visibleRect` —
// the ghost took the dimensions of the visible page area, causing it to scale up to
// match the expanded page image. The fix keeps the ghost at source keyhole dimensions
// (`snapshot.viewportRect`) and centers the image mass over the page center (pure
// translate, no scale). This test pins both properties.

/** Create a minimal GhostSnapshot with the given viewport and image geometry. */
function makeSnapshot(opts: {
  viewportW: number;
  viewportH: number;
  imageOffsetLeft?: number;
  imageOffsetTop?: number;
  imageWidth?: number;
  imageHeight?: number;
}): GhostSnapshot {
  const {
    viewportW,
    viewportH,
    imageOffsetLeft = 0,
    imageOffsetTop = 0,
    imageWidth = viewportW,
    imageHeight = viewportH,
  } = opts;
  return {
    viewportRect: new DOMRect(0, 0, viewportW, viewportH),
    imageSrc: "data:image/png;base64,abc",
    imageOffsetLeft,
    imageOffsetTop,
    imageWidth,
    imageHeight,
    imageNaturalWidth: imageWidth,
    imageNaturalHeight: imageHeight,
    sourceKind: null,
    sourceAnchorX: 0.5,
    sourceAnchorY: 0.5,
    borderRadius: "0px",
  };
}

/** Build a document fragment with a container + img that returns the given rects. */
function makeRoot(
  containerRect: DOMRect,
  imgRect: DOMRect,
): { root: HTMLElement; cleanup: () => void } {
  const root = document.createElement("div");
  const container = document.createElement("div");
  container.setAttribute("data-dc-inline-expanded", "");
  container.setAttribute("data-dc-no-annotation", "");
  const img = document.createElement("img");
  container.appendChild(img);
  root.appendChild(container);

  // jsdom does not do layout; mock getBoundingClientRect on each element.
  container.getBoundingClientRect = () => containerRect;
  img.getBoundingClientRect = () => imgRect;

  document.body.appendChild(root);
  const cleanup = () => root.remove();
  return { root, cleanup };
}

describe("buildGhostTargetFromViewport — ghost dimensions invariant", () => {
  test("ghostRect uses snapshot keyhole dimensions, not visibleRect dimensions", () => {
    // Keyhole: 300×120. Page image: 800×600 centered on screen.
    const snapshot = makeSnapshot({ viewportW: 300, viewportH: 120 });
    const containerRect = new DOMRect(100, 100, 800, 600); // large page container
    const imgRect = new DOMRect(100, 100, 800, 600);
    const { root, cleanup } = makeRoot(containerRect, imgRect);

    const result = buildGhostTargetFromViewport(root, snapshot);
    cleanup();

    expect(result).not.toBeNull();
    // Ghost must match keyhole dimensions, NOT the visible page area (800×600)
    expect(result!.ghostRect.width).toBe(300);
    expect(result!.ghostRect.height).toBe(120);
  });

  test("ghostRect image center-of-mass lands on the visible page center", () => {
    // Keyhole: 300×120, image at offset (30, 10) within ghost, size 240×100.
    // Image center-of-mass within ghost: (30 + 240/2, 10 + 100/2) = (150, 60).
    const snapshot = makeSnapshot({
      viewportW: 300,
      viewportH: 120,
      imageOffsetLeft: 30,
      imageOffsetTop: 10,
      imageWidth: 240,
      imageHeight: 100,
    });
    // Visible page area (intersection of container + img, both the same here)
    const containerRect = new DOMRect(200, 150, 600, 400);
    const imgRect = new DOMRect(200, 150, 600, 400);
    const { root, cleanup } = makeRoot(containerRect, imgRect);

    const result = buildGhostTargetFromViewport(root, snapshot);
    cleanup();

    expect(result).not.toBeNull();
    const { ghostRect } = result!;

    // Page center: (200 + 600/2, 150 + 400/2) = (500, 350)
    const pageCX = 500;
    const pageCY = 350;
    const anchorInGhostX = 30 + 240 / 2; // 150
    const anchorInGhostY = 10 + 100 / 2; // 60

    // Ghost top-left should be (pageCX - anchorX, pageCY - anchorY) = (350, 290)
    expect(ghostRect.left).toBeCloseTo(pageCX - anchorInGhostX);
    expect(ghostRect.top).toBeCloseTo(pageCY - anchorInGhostY);

    // Image center in viewport space at ghost position = ghost.left + anchorX = pageCX
    expect(ghostRect.left + anchorInGhostX).toBeCloseTo(pageCX);
    expect(ghostRect.top + anchorInGhostY).toBeCloseTo(pageCY);
  });

  test("markerRect is the visible intersection of container and img", () => {
    // Container partially off-screen; img fully inside container.
    const snapshot = makeSnapshot({ viewportW: 200, viewportH: 80 });
    const containerRect = new DOMRect(50, 50, 500, 400);
    const imgRect = new DOMRect(100, 100, 300, 200); // img inside container
    const { root, cleanup } = makeRoot(containerRect, imgRect);

    const result = buildGhostTargetFromViewport(root, snapshot);
    cleanup();

    expect(result).not.toBeNull();
    // Visible intersection = imgRect (fully within container)
    expect(result!.markerRect.left).toBe(100);
    expect(result!.markerRect.top).toBe(100);
    expect(result!.markerRect.width).toBe(300);
    expect(result!.markerRect.height).toBe(200);
  });

  test("returns null when img rect is not visible", () => {
    const snapshot = makeSnapshot({ viewportW: 200, viewportH: 80 });
    const containerRect = new DOMRect(100, 100, 400, 300);
    const imgRect = new DOMRect(100, 100, 0, 0); // zero-size → not visible
    const { root, cleanup } = makeRoot(containerRect, imgRect);

    const result = buildGhostTargetFromViewport(root, snapshot);
    cleanup();

    expect(result).toBeNull();
  });

  test("returns null when no matching container exists in root", () => {
    const snapshot = makeSnapshot({ viewportW: 200, viewportH: 80 });
    const root = document.createElement("div"); // no [data-dc-inline-expanded] children
    const result = buildGhostTargetFromViewport(root, snapshot);
    expect(result).toBeNull();
  });

  test("spotlightRect is always null (no spotlight in miss/not_found)", () => {
    const snapshot = makeSnapshot({ viewportW: 200, viewportH: 80 });
    const containerRect = new DOMRect(100, 100, 400, 300);
    const imgRect = new DOMRect(100, 100, 400, 300);
    const { root, cleanup } = makeRoot(containerRect, imgRect);

    const result = buildGhostTargetFromViewport(root, snapshot);
    cleanup();

    expect(result).not.toBeNull();
    expect(result!.spotlightRect).toBeNull();
  });
});
