import { describe, expect, test } from "bun:test";
import { KEYHOLE_STRIP_HEIGHT_DEFAULT, projectKeyholeDisplayedWidth } from "../react/constants";
// This helper is load-bearing for popover width stability: it feeds both the
// `usePopoverPosition` width seed and the `DefaultPopoverContent` initial state
// so the summary popover can render at the final width on first paint instead
// of popping between an estimate and the measured width. The key invariant is
// that the keyhole *never upscales* — its real render uses
// `zoom = Math.min(1, stripHeight / naturalHeight)` — so short images must
// project to their natural width, not an upscaled phantom.
describe("projectKeyholeDisplayedWidth", () => {
    test("returns null for null or undefined dimensions", () => {
        expect(projectKeyholeDisplayedWidth(null)).toBeNull();
        expect(projectKeyholeDisplayedWidth(undefined)).toBeNull();
    });
    test("returns null for non-finite or non-positive dimensions", () => {
        expect(projectKeyholeDisplayedWidth({ width: 0, height: 100 })).toBeNull();
        expect(projectKeyholeDisplayedWidth({ width: 100, height: 0 })).toBeNull();
        expect(projectKeyholeDisplayedWidth({ width: -10, height: 100 })).toBeNull();
        expect(projectKeyholeDisplayedWidth({ width: 100, height: -10 })).toBeNull();
        expect(projectKeyholeDisplayedWidth({ width: Number.NaN, height: 100 })).toBeNull();
        expect(projectKeyholeDisplayedWidth({ width: 100, height: Number.POSITIVE_INFINITY })).toBeNull();
    });
    test("downscales a tall image to fit the strip height", () => {
        // 600 tall → zoom = 120/600 = 0.2; width 1000 → 200
        expect(projectKeyholeDisplayedWidth({ width: 1000, height: 600 })).toBeCloseTo(200);
    });
    test("renders a perfectly-fitting image at natural width", () => {
        expect(projectKeyholeDisplayedWidth({ width: 800, height: KEYHOLE_STRIP_HEIGHT_DEFAULT })).toBeCloseTo(800);
    });
    // The regression this whole commit prevents: a short image must NOT be
    // projected wider than its natural width. The previous formula
    // `width × (STRIP_HEIGHT / height)` would have returned 1800 for 1200×80
    // because 120/80 = 1.5 — a phantom upscaled width. The real keyhole render
    // clamps zoom to ≤1, so the actual displayed width is 1200. If projection
    // and actual ever diverge, the popover flashes between widths on mount.
    test("does NOT upscale a short image — zoom clamped to ≤1.0", () => {
        const projected = projectKeyholeDisplayedWidth({ width: 1200, height: 80 });
        expect(projected).toBe(1200);
        expect(projected).not.toBeCloseTo(1800);
    });
    test("does NOT upscale a very short image", () => {
        // 20 tall → naive formula: 500 × (120/20) = 3000. Correct: 500.
        expect(projectKeyholeDisplayedWidth({ width: 500, height: 20 })).toBe(500);
    });
    test("respects a custom stripHeight argument", () => {
        // With stripHeight=60 and a 200-tall image, zoom = 60/200 = 0.3; 1000 → 300
        expect(projectKeyholeDisplayedWidth({ width: 1000, height: 200 }, 60)).toBeCloseTo(300);
        // Same image with stripHeight=300 should NOT upscale beyond natural width
        expect(projectKeyholeDisplayedWidth({ width: 1000, height: 200 }, 300)).toBe(1000);
    });
});
