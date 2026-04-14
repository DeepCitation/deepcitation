import { describe, expect, test } from "@jest/globals";
import type { GhostSnapshot } from "../react/viewTransition";
import { buildGhostTargetFromViewport } from "../react/viewTransition";

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
function makeRoot(containerRect: DOMRect, imgRect: DOMRect): { root: HTMLElement; cleanup: () => void } {
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
    expect(result?.ghostRect.width).toBe(300);
    expect(result?.ghostRect.height).toBe(120);
  });

  test("ghostRect visible viewport center lands on the visible page center", () => {
    // Keyhole: 300×120, image at offset (30, 10) within ghost, size 240×100.
    // In this test the image happens to be centered in the viewport:
    // (30 + 240/2, 10 + 100/2) = (150, 60) = (300/2, 120/2). The anchor is
    // the viewport center (srcW/2, srcH/2) = (150, 60).
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
    if (result == null) return; // narrow for TypeScript — expect above handles failure

    const { ghostRect } = result;

    // Page center: (200 + 600/2, 150 + 400/2) = (500, 350)
    const pageCX = 500;
    const pageCY = 350;
    // Anchor = viewport center
    const anchorInGhostX = 300 / 2; // 150
    const anchorInGhostY = 120 / 2; // 60

    // Ghost top-left should be (pageCX - anchorX, pageCY - anchorY) = (350, 290)
    expect(ghostRect.left).toBeCloseTo(pageCX - anchorInGhostX);
    expect(ghostRect.top).toBeCloseTo(pageCY - anchorInGhostY);

    // Viewport center in viewport space at ghost position = ghost.left + anchorX = pageCX
    expect(ghostRect.left + anchorInGhostX).toBeCloseTo(pageCX);
    expect(ghostRect.top + anchorInGhostY).toBeCloseTo(pageCY);
  });

  test("ghostRect anchor uses viewport center, not image center (scrolled image)", () => {
    // Regression for the anchor-overshoot bug: a tall image scrolled so its
    // center is NOT at the viewport center.
    // Keyhole: 400×120. Tall image 400×600, scrolled down 300px:
    //   imageOffsetTop = -300, imageHeight = 600
    //   image center-of-mass in ghost: -300 + 600/2 = 0 (at ghost top edge)
    //   viewport center in ghost: 120/2 = 60 (correct — annotation is centered)
    const snapshot = makeSnapshot({
      viewportW: 400,
      viewportH: 120,
      imageOffsetLeft: 0,
      imageOffsetTop: -300,
      imageWidth: 400,
      imageHeight: 600,
    });
    const containerRect = new DOMRect(100, 200, 400, 600);
    const imgRect = new DOMRect(100, 200, 400, 600);
    const { root, cleanup } = makeRoot(containerRect, imgRect);

    const result = buildGhostTargetFromViewport(root, snapshot);
    cleanup();

    expect(result).not.toBeNull();
    if (result == null) return;

    const { ghostRect } = result;

    // Page center: (100 + 400/2, 200 + 600/2) = (300, 500)
    const pageCX = 300;
    const pageCY = 500;
    // Anchor = viewport center (NOT image center, which would be 0)
    const anchorX = 400 / 2; // 200
    const anchorY = 120 / 2; // 60

    expect(ghostRect.left).toBeCloseTo(pageCX - anchorX); // 100
    expect(ghostRect.top).toBeCloseTo(pageCY - anchorY); // 440

    // OLD (wrong) behavior would have used image center anchor = (200, 0),
    // giving ghostRect.top = pageCY - 0 = 500. Assert it's NOT that.
    expect(ghostRect.top).not.toBeCloseTo(500);
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
    expect(result?.markerRect.left).toBe(100);
    expect(result?.markerRect.top).toBe(100);
    expect(result?.markerRect.width).toBe(300);
    expect(result?.markerRect.height).toBe(200);
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
    expect(result?.spotlightRect).toBeNull();
  });
});
