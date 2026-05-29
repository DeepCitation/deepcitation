import { describe, expect, it } from "bun:test";
import { alignOffset, expandedPageOffset, guardClamp, lockSide } from "../shared/popoverGeometry";
describe("lockSide", () => {
    it("picks bottom when enough space below", () => {
        expect(lockSide(400, 400, 900, "bottom")).toBe("bottom");
    });
    it("flips to top when insufficient space below", () => {
        expect(lockSide(850, 850, 900, "bottom")).toBe("top");
    });
    it("picks top when enough space above", () => {
        expect(lockSide(500, 500, 900, "top")).toBe("top");
    });
    it("flips to bottom when insufficient space above", () => {
        expect(lockSide(500, 100, 900, "top")).toBe("bottom");
    });
    it("respects custom threshold", () => {
        // 150px below, threshold 100 — enough space
        expect(lockSide(750, 750, 900, "bottom", 100)).toBe("bottom");
        // 150px below, threshold 200 — not enough
        expect(lockSide(750, 750, 900, "bottom", 200)).toBe("top");
    });
    it("accounts for containerTop (fixed header height) when measuring space above", () => {
        // Trigger at viewport y=250, header 64px → usable space above = 186px < 200 → flip to bottom
        expect(lockSide(270, 250, 900, "top", undefined, 64)).toBe("bottom");
        // Without containerTop: 250 >= 200 → stays top
        expect(lockSide(270, 250, 900, "top")).toBe("top");
        // With containerTop but enough space: trigger at y=270, header 64px → 206px ≥ 200 → top
        expect(lockSide(290, 270, 900, "top", undefined, 64)).toBe("top");
    });
});
describe("alignOffset", () => {
    it("centers popover on trigger when space allows", () => {
        // Trigger at 500px, 100px wide; popover 300px wide; viewport 1024px
        const offset = alignOffset(1024, 500, 100, 300);
        // Centered: triggerCenter=550, centeredLeft=400, desired=400, offset=400-500=-100
        expect(offset).toBe(-100);
    });
    it("clamps to left edge", () => {
        // Trigger at 10px — centering would push left of viewport
        const offset = alignOffset(1024, 10, 50, 400);
        expect(offset).toBeGreaterThanOrEqual(0); // Must stay within margin
    });
    it("clamps to right edge", () => {
        // Trigger near right edge
        const offset = alignOffset(1024, 900, 50, 400);
        // desiredLeft = max(16, 1024-16-400)=608, offset = 608 - 900 = -292
        expect(offset).toBeLessThan(0);
        // Verify popover stays in viewport: 900 + offset + 400 <= 1024 - 16
        expect(900 + offset + 400).toBeLessThanOrEqual(1024 - 16);
    });
    it("handles narrow viewport where popover exceeds width", () => {
        // Viewport 300px, popover 400px — wider than viewport
        const offset = alignOffset(300, 50, 50, 400);
        // When maxLeft < minLeft, desiredLeft = minLeft = 16
        expect(offset).toBe(16 - 50);
    });
});
describe("expandedPageOffset", () => {
    it("positions bottom-side at 1rem from viewport top", () => {
        // Trigger bottom at 300px, padding 16px
        const offset = expandedPageOffset("bottom", 280, 300, 900);
        expect(offset).toBe(16 - 300); // -284
    });
    it("positions top-side at 1rem from viewport bottom", () => {
        // Trigger top at 500px, viewport 900px, padding 16px
        const offset = expandedPageOffset("top", 500, 520, 900);
        expect(offset).toBe(500 - (900 - 16)); // 500 - 884 = -384
    });
});
describe("guardClamp", () => {
    it("returns zero correction when element is within bounds", () => {
        const { dx, dy } = guardClamp({ top: 50, left: 50, right: 350, bottom: 400 }, 1024, 768);
        expect(dx).toBe(0);
        expect(dy).toBe(0);
    });
    it("corrects element overflowing left", () => {
        const { dx } = guardClamp({ top: 50, left: 5, right: 305, bottom: 200 }, 1024, 768);
        expect(dx).toBe(16 - 5); // Push right by 11px
    });
    it("corrects element overflowing right", () => {
        const { dx } = guardClamp({ top: 50, left: 800, right: 1020, bottom: 200 }, 1024, 768);
        expect(dx).toBe(1024 - 16 - 1020); // Push left by -12px
    });
    it("corrects element overflowing top", () => {
        const { dy } = guardClamp({ top: -20, left: 50, right: 350, bottom: 200 }, 1024, 768);
        expect(dy).toBe(20); // Push down by 20px
    });
    it("corrects element overflowing bottom", () => {
        const { dy } = guardClamp({ top: 600, left: 50, right: 350, bottom: 800 }, 1024, 768);
        expect(dy).toBe(768 - 800); // Push up by -32px
    });
    it("skips vertical correction when requested", () => {
        const { dx, dy } = guardClamp({ top: -20, left: 5, right: 305, bottom: 200 }, 1024, 768, true);
        expect(dx).toBe(16 - 5);
        expect(dy).toBe(0); // Vertical skipped
    });
    it("respects topInset — clamps to header height, not viewport top", () => {
        // Element top at y=30, header (topInset) = 64px → needs to shift down by 34px
        const { dy } = guardClamp({ top: 30, left: 50, right: 350, bottom: 280 }, 1024, 768, false, 16, 64);
        expect(dy).toBe(64 - 30); // +34
    });
    it("no correction when element top is exactly at topInset", () => {
        const { dy } = guardClamp({ top: 64, left: 50, right: 350, bottom: 314 }, 1024, 768, false, 16, 64);
        expect(dy).toBe(0);
    });
    it("topInset defaults to 0 — existing overflow-top behavior unchanged", () => {
        const { dy } = guardClamp({ top: -20, left: 50, right: 350, bottom: 200 }, 1024, 768);
        expect(dy).toBe(20);
    });
});
