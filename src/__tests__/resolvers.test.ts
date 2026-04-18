/**
 * Tests for resolveEvidenceSourceAnchorRatio() — aim anchor resolver
 * used by keyhole/page aim overlays and view-transition ghost animations.
 *
 * The ratio is consumed by both the keyhole strip and the full-page image
 * at different container heights. Anchoring at the vertical midpoint of a
 * multi-line text item produces parallax drift between the two endpoints,
 * so y must be pinned to the TOP edge of the matched item. x stays centered.
 */

import { describe, expect, it } from "@jest/globals";
import { resolveEvidenceSourceAnchorRatio } from "../react/evidence/resolvers";
import type { Verification } from "../types/verification";

describe("resolveEvidenceSourceAnchorRatio", () => {
  it("returns null when evidence is missing", () => {
    expect(resolveEvidenceSourceAnchorRatio(null)).toBeNull();
    expect(resolveEvidenceSourceAnchorRatio(undefined)).toBeNull();
    expect(resolveEvidenceSourceAnchorRatio({ status: "found" } as Verification)).toBeNull();
  });

  it("returns null when dimensions are invalid", () => {
    const verification: Verification = {
      status: "found",
      evidence: {
        src: "x",
        dimensions: { width: 0, height: 0 },
        textItems: [{ x: 0, y: 0, width: 10, height: 10, text: "hi" }],
      },
    };
    expect(resolveEvidenceSourceAnchorRatio(verification)).toBeNull();
  });

  it("anchors y at the TOP of the matched item, not its midpoint", () => {
    // A multi-line paragraph: y=100, height=80, page height=1000.
    //   Top-anchor y ratio: 100 / 1000 = 0.1
    //   Midpoint y ratio:  (100 + 40) / 1000 = 0.14  <-- the old, wrong value
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "founders make them take",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [{ x: 200, y: 100, width: 500, height: 80, text: "founders make them take" }],
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    expect(ratio).not.toBeNull();
    expect(ratio?.y).toBeCloseTo(0.1, 5);
    expect(ratio?.y).not.toBeCloseTo(0.14, 2);
  });

  it("keeps x centered on the matched item", () => {
    // Item spans x=200 to x=700 on a 1000-wide page.
    //   Centered x ratio: (200 + 250) / 1000 = 0.45
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "founders make them take",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [{ x: 200, y: 100, width: 500, height: 80, text: "founders make them take" }],
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    expect(ratio?.x).toBeCloseTo(0.45, 5);
  });

  it("clamps to [0, 1] for out-of-bounds items", () => {
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "overflow",
      evidence: {
        src: "x",
        dimensions: { width: 100, height: 100 },
        textItems: [{ x: -50, y: -50, width: 10, height: 10, text: "overflow" }],
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    expect(ratio?.x).toBe(0);
    expect(ratio?.y).toBe(0);
  });

  it("falls back to sourceContextDeepItem when verifiedSourceMatch does not match any item", () => {
    const verification: Verification = {
      status: "found",
      verifiedSourceContext: "context phrase here",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [{ x: 100, y: 500, width: 200, height: 40, text: "context phrase here" }],
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    expect(ratio).not.toBeNull();
    expect(ratio?.y).toBeCloseTo(0.5, 5); // top edge of item at y=500
  });
});
