/**
 * Tests for resolveEvidenceSourceAnchorRatio() — aim anchor resolver
 * used by keyhole/page aim overlays and view-transition ghost animations.
 *
 * The ratio is consumed by the page-expand / page-collapse ghost animations
 * to align the ghost over the spotlight on the page view. The spotlight is
 * centered on the citation midpoint (symmetric padding around the text
 * bbox), so the anchor must be the citation MIDPOINT on both axes — top-edge
 * anchoring offsets the ghost's citation by half its rendered height,
 * producing a visible "off" start during collapse and a "jump" at handoff
 * when the ghost fades to the real page citation.
 */

import { describe, expect, it } from "bun:test";
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

  it("anchors y at the MIDPOINT of the matched item", () => {
    // A multi-line paragraph: y=100, height=80, page height=1000.
    //   Midpoint y ratio: (100 + 40) / 1000 = 0.14  — matches spotlight center
    //   Top-anchor y ratio: 100 / 1000 = 0.1       — would offset ghost half-citation up
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
    expect(ratio?.y).toBeCloseTo(0.14, 5);
    expect(ratio?.y).not.toBeCloseTo(0.1, 2);
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
    expect(ratio?.y).toBeCloseTo(0.52, 5); // midpoint of item at y=500, height=40 → (500+20)/1000
  });

  // Regression for the visible "ghost starts off on x and y" jump on collapse
  // (scratch/collapse4.png). The page-view spotlight is rendered by
  // CitationAnnotationOverlay and centered on `sourceContextDeepItem`'s bbox,
  // which can span MULTIPLE lines for a wrapped citation. The ghost's anchor
  // ratio must therefore reference the SAME multi-line bbox center — taking a
  // single matching line's midpoint offsets the ghost by half-line-gap on
  // y and by line-width-asymmetry on x at the very first frame of collapse.
  it("anchors at the union-bbox midpoint when the match spans multiple lines", () => {
    // Two-line wrapped citation. Page is 1000×1000.
    //   Line 1: y=100..120, x=200..400 (narrower)
    //   Line 2: y=130..150, x=200..500 (wider)
    //   Combined union bbox: x=200..500, y=100..150
    //   Combined midpoint: x=350, y=125 → ratio (0.35, 0.125)
    //   Single-line midpoint (old behavior): line1 mid = (300, 110) → (0.30, 0.11) ← WRONG
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "founders make them take a quick break",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          { x: 200, y: 100, width: 200, height: 20, text: "founders make them" },
          { x: 200, y: 130, width: 300, height: 20, text: "take a quick break" },
        ],
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    expect(ratio).not.toBeNull();
    expect(ratio?.x).toBeCloseTo(0.35, 5);
    expect(ratio?.y).toBeCloseTo(0.125, 5);
  });

  // Same problem in the sourceContextDeepItem fallback path: a multi-line
  // context produces multiple matching items, and the union bbox is the only
  // anchor that aligns with the spotlight (which uses the full context bbox).
  it("union-bbox midpoint also applies when matching against sourceContextDeepItem text", () => {
    const verification: Verification = {
      status: "found",
      // No verifiedSourceMatch — falls through to sourceContextDeepItem matching.
      verifiedSourceContext: "wrapped context across two display lines",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          { x: 100, y: 400, width: 250, height: 30, text: "wrapped context across" },
          { x: 100, y: 440, width: 200, height: 30, text: "two display lines" },
        ],
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    expect(ratio).not.toBeNull();
    // Union bbox: x=100..350, y=400..470 → midpoint (225, 435) → (0.225, 0.435)
    expect(ratio?.x).toBeCloseTo(0.225, 5);
    expect(ratio?.y).toBeCloseTo(0.435, 5);
  });

  // Regression for scratch/collapse5.png: the union-bbox fix made things worse
  // because `target.includes(itemText)` has no minimum-length floor. Common short
  // words like "the", "and", "in", "a" appearing ANYWHERE on the page satisfy
  // target.includes(...) when the target is any normal-length citation, so they
  // land in the same scoring tier as the real citation lines and get unioned in.
  // The ghost's anchor then sits at the centroid of (citation bbox ∪ stray-word
  // bboxes scattered across the page) — visibly off the spotlight at frame 0,
  // worse than the single-line midpoint we started with.
  it("does not pollute the union with short common-word substrings of the target", () => {
    // Real wrapped citation: lines at y=100..150, x=200..500 → midpoint (350, 125)
    // Distractors: stray "the" / "a" items elsewhere on the page that happen to
    // be substrings of the target. They must NOT contribute to the anchor union.
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "founders make them take a quick break",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          { x: 200, y: 100, width: 200, height: 20, text: "founders make them" },
          { x: 200, y: 130, width: 300, height: 20, text: "take a quick break" },
          // Stray short-word items elsewhere on the page (substrings of target):
          { x: 800, y: 800, width: 30, height: 20, text: "the" },
          { x: 50, y: 900, width: 10, height: 20, text: "a" },
          { x: 900, y: 50, width: 50, height: 20, text: "make" },
        ],
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    expect(ratio?.x).toBeCloseTo(0.35, 5);
    expect(ratio?.y).toBeCloseTo(0.125, 5);
  });

  // Regression for the collapse5.png trigger the user reported:
  // "this problem still happens when expanding the keyhole to its full size,
  // then going from focus to page and back." When the keyhole is unclipped to
  // full-page size, `evidence.textItems` contains the WHOLE page's text items
  // (not just the cropped citation region). Almost every page contains short
  // common words like "the", "a", "make", "take" scattered top-to-bottom — each
  // satisfies `target.includes(itemText)` for any normal-length citation and
  // lands in the same scoring tier as the real citation lines. Unioning them
  // collapses the anchor toward the page's geometric center — which is why the
  // offset gets WORSE as the keyhole expands (more textItems → more distractors).
  it("full-keyhole scenario: stray common words across the page must not drag the anchor", () => {
    // Real wrapped citation at y=100..150, x=200..500 → midpoint (350, 125) → (0.35, 0.125)
    // Plus realistic page chrome: common words scattered across a 1000x1000 page.
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "founders make them take a quick break",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          { x: 200, y: 100, width: 200, height: 20, text: "founders make them" },
          { x: 200, y: 130, width: 300, height: 20, text: "take a quick break" },
          { x: 50, y: 300, width: 30, height: 15, text: "the" },
          { x: 120, y: 340, width: 15, height: 15, text: "a" },
          { x: 700, y: 360, width: 40, height: 15, text: "make" },
          { x: 880, y: 420, width: 50, height: 15, text: "break" },
          { x: 60, y: 500, width: 30, height: 15, text: "the" },
          { x: 400, y: 620, width: 40, height: 15, text: "take" },
          { x: 820, y: 740, width: 50, height: 15, text: "quick" },
          { x: 100, y: 880, width: 15, height: 15, text: "a" },
          { x: 940, y: 940, width: 30, height: 15, text: "the" },
        ],
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    expect(ratio?.x).toBeCloseTo(0.35, 2);
    expect(ratio?.y).toBeCloseTo(0.125, 2);
  });

  // ─── sourceContextDeepItem spotlight alignment (scratch/collapse6.png) ───
  //
  // CitationAnnotationOverlay centers the spotlight on `sourceContextDeepItem`'s
  // bbox — typically the containing sentence/row, WIDER than `verifiedSourceMatch`.
  // When verifiedSourceMatch is a shorter substring that exact-matches a SINGLE
  // evidence item (tier 3, highest score), the resolver's winningTarget becomes
  // verifiedSourceMatch, the tier filter drops every sourceContextDeepItem match,
  // and the anchor lands on the fragment item — offset from the spotlight by
  // half the sourceContext span on the axis that wraps. These tests pin the
  // failure: the anchor must align with the sourceContextDeepItem center
  // (= spotlight center), not with the stray verifiedSourceMatch exact match.

  it("wrapped spotlight: anchor must span both lines even when verifiedSourceMatch exact-matches line 1", () => {
    // sourceContextDeepItem wraps 2 lines in evidence (y=100..120 and y=130..150).
    // verifiedSourceMatch = "founders make them" is an EXACT match to line 1 only
    // (tier 3, score 4018). sourceContextDeepItem.text produces tier-2 matches on
    // both lines (score 3018 each) — outscored by the single tier-3 exact match.
    // The resolver currently picks the line-1-only item; spotlight center is at
    // y=125 (mid of both lines), so the anchor lands half a line high.
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "founders make them",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          { x: 200, y: 100, width: 200, height: 20, text: "founders make them" },
          { x: 200, y: 130, width: 300, height: 20, text: "take a quick break" },
        ],
      },
      document: {
        sourceContextDeepItem: {
          x: 200,
          y: 100,
          width: 300,
          height: 50,
          text: "founders make them take a quick break",
        },
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    // Spotlight center y = (100 + 150) / 2 = 125 → ratio 0.125.
    expect(ratio?.y).toBeCloseTo(0.125, 2);
  });

  it("wrapped spotlight: same misalignment when verifiedSourceMatch exact-matches line 2", () => {
    // Symmetric to the previous case — verifiedSourceMatch picks line 2 instead.
    // Anchor still needs to cover the full sourceContextDeepItem span.
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "take a quick break",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          { x: 200, y: 100, width: 200, height: 20, text: "founders make them" },
          { x: 200, y: 130, width: 300, height: 20, text: "take a quick break" },
        ],
      },
      document: {
        sourceContextDeepItem: {
          x: 200,
          y: 100,
          width: 300,
          height: 50,
          text: "founders make them take a quick break",
        },
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    expect(ratio?.y).toBeCloseTo(0.125, 2);
  });

  it("row layout: anchor must span name+value when sourceContextDeepItem covers the whole row", () => {
    // Status-page row (from scratch/collapse6.png): name column on the left,
    // value column on the right, same y. sourceContextDeepItem is the whole
    // row; verifiedSourceMatch is just the name column. Spotlight centers at
    // the row midpoint (x≈450); the resolver currently anchors on the name
    // column (x≈175), offsetting the ghost horizontally.
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "citation verification",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          { x: 50, y: 200, width: 250, height: 20, text: "citation verification" },
          { x: 700, y: 200, width: 150, height: 20, text: "99.9% uptime" },
        ],
      },
      document: {
        sourceContextDeepItem: {
          x: 50,
          y: 200,
          width: 800,
          height: 20,
          text: "citation verification 99.9% uptime",
        },
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    // Union x = [50, 850] → midpoint 450 → ratio 0.45.
    expect(ratio?.x).toBeCloseTo(0.45, 2);
    // y is unchanged regardless (single row)
    expect(ratio?.y).toBeCloseTo(0.21, 2);
  });

  it("three-line wrap: anchor spans all three lines even when verifiedSourceMatch exact-matches line 1", () => {
    // Three-way asymmetric wrap so line-1-only and union midpoints differ.
    // verifiedSourceMatch = "founders" (exact for line 1 at y=100..120, mid 110).
    // sourceContextDeepItem spans y=100..180, mid 140.
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "founders",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          { x: 200, y: 100, width: 150, height: 20, text: "founders" },
          { x: 200, y: 130, width: 150, height: 20, text: "make them" },
          { x: 200, y: 160, width: 200, height: 20, text: "take a quick break" },
        ],
      },
      document: {
        sourceContextDeepItem: {
          x: 200,
          y: 100,
          width: 250,
          height: 80,
          text: "founders make them take a quick break",
        },
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    // Union y midpoint = 140 → 0.14 (current bug returns 0.11)
    expect(ratio?.y).toBeCloseTo(0.14, 2);
  });

  // ─── anchor ↔ spotlight invariant (the REAL failure reproduction) ───
  //
  // The prior tests hand-compute expected ratios from the same inputs the
  // resolver uses, so they can pass even when the resolver disagrees with
  // what CitationAnnotationOverlay actually draws on the page. That's how
  // collapse4/5/6 kept slipping through.
  //
  // This block pins the invariant: for every verification with a
  // sourceContextDeepItem, the resolver's output MUST equal the center of
  // that bbox (the same center CitationAnnotationOverlay uses to draw the
  // spotlight). If the two disagree, the ghost visibly offsets from the
  // spotlight at handoff — by exactly `(anchor - spotlight) * imageSize` px.
  describe("anchor ↔ spotlight invariant", () => {
    // Mirrors CitationAnnotationOverlay's spotlight center (via toPercentRect
    // with renderScale=1, origin="image"). Bypasses the resolver so the
    // expected value is derived independently, the way the UI derives it.
    function spotlightCenterRatio(v: Verification): { x: number; y: number } {
      // biome-ignore lint/style/noNonNullAssertion: test fixtures define these
      const ctx = v.document!.sourceContextDeepItem!;
      // biome-ignore lint/style/noNonNullAssertion: test fixtures define these
      const dims = v.evidence!.dimensions!;
      const clamp = (n: number) => Math.max(0, Math.min(1, n));
      return {
        x: clamp((ctx.x + ctx.width / 2) / dims.width),
        y: clamp((ctx.y + ctx.height / 2) / dims.height),
      };
    }

    // Parent-item case: OCR returned one text item that's WIDER than the
    // citation. Unioning matching items gives the parent bbox, not the
    // narrower sourceContextDeepItem — anchor drifts to the parent center.
    it("holds when evidence item is wider than sourceContextDeepItem", () => {
      const verification: Verification = {
        status: "found",
        verifiedSourceMatch: "founders make them take a quick break",
        evidence: {
          src: "x",
          dimensions: { width: 1000, height: 1000 },
          textItems: [
            {
              x: 100,
              y: 100,
              width: 400,
              height: 20,
              text: "the founders make them take a quick break today",
            },
          ],
        },
        document: {
          sourceContextDeepItem: {
            x: 140,
            y: 100,
            width: 280,
            height: 20,
            text: "founders make them take a quick break",
          },
        },
      };
      const anchor = resolveEvidenceSourceAnchorRatio(verification);
      const spotlight = spotlightCenterRatio(verification);
      expect(anchor?.x).toBeCloseTo(spotlight.x, 3);
      expect(anchor?.y).toBeCloseTo(spotlight.y, 3);
    });

    // Primary path fires even when textItems don't match — sourceContextDeepItem
    // is the source of truth, so unmatched items don't affect the anchor at all.
    it("holds when textItems have no citation matches (primary path fires via sourceContextDeepItem)", () => {
      const verification: Verification = {
        status: "found",
        verifiedSourceMatch: "business associate agreement",
        evidence: {
          src: "x",
          dimensions: { width: 1000, height: 1000 },
          textItems: [
            { x: 0, y: 0, width: 100, height: 20, text: "header chrome" },
            { x: 900, y: 990, width: 100, height: 20, text: "page 1 of 10" },
          ],
        },
        document: {
          sourceContextDeepItem: {
            x: 100,
            y: 500,
            width: 500,
            height: 20,
            text: "business associate agreement",
          },
        },
      };
      const anchor = resolveEvidenceSourceAnchorRatio(verification);
      const spotlight = spotlightCenterRatio(verification);
      expect(anchor).not.toBeNull();
      expect(anchor?.x).toBeCloseTo(spotlight.x, 3);
      expect(anchor?.y).toBeCloseTo(spotlight.y, 3);
    });

    // Realistic collapse6 shape: verifiedSourceMatch exact-matches a short
    // fragment (single word) of a multi-line sourceContextDeepItem, AND
    // evidence.textItems has stray same-tier noise. Resolver must still
    // agree with the spotlight (= context center), not drift toward the
    // fragment or the noise.
    it("holds under the full collapse6 scenario (fragment match + noise)", () => {
      const verification: Verification = {
        status: "found",
        verifiedSourceMatch: "founders",
        evidence: {
          src: "x",
          dimensions: { width: 1000, height: 1000 },
          textItems: [
            { x: 200, y: 100, width: 150, height: 20, text: "founders" },
            { x: 200, y: 130, width: 150, height: 20, text: "make them" },
            { x: 200, y: 160, width: 200, height: 20, text: "take a quick break" },
            { x: 50, y: 300, width: 30, height: 15, text: "the" },
            { x: 700, y: 360, width: 40, height: 15, text: "make" },
            { x: 820, y: 740, width: 50, height: 15, text: "quick" },
          ],
        },
        document: {
          sourceContextDeepItem: {
            x: 200,
            y: 100,
            width: 250,
            height: 80,
            text: "founders make them take a quick break",
          },
        },
      };
      const anchor = resolveEvidenceSourceAnchorRatio(verification);
      const spotlight = spotlightCenterRatio(verification);
      expect(anchor?.x).toBeCloseTo(spotlight.x, 3);
      expect(anchor?.y).toBeCloseTo(spotlight.y, 3);
    });
  });

  // True legacy-fallback path: no sourceContextDeepItem present — resolver
  // derives anchor from textItems only. Validates the union/scoring logic that
  // the invariant describe block above cannot exercise (those fixtures all
  // supply a valid sourceContextDeepItem that short-circuits to primary path).
  it("legacy fallback: returns null when no sourceContextDeepItem and no items match", () => {
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "business associate agreement",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          { x: 0, y: 0, width: 100, height: 20, text: "header chrome" },
          { x: 900, y: 990, width: 100, height: 20, text: "page 1 of 10" },
        ],
      },
    };
    expect(resolveEvidenceSourceAnchorRatio(verification)).toBeNull();
  });

  // ─── bounds-check guard: page-space vs evidence-space ───────────────────
  // When sourceContextDeepItem coordinates exceed evidence.dimensions, they
  // are in a different coordinate space (PDF/page space) and dividing by
  // dims produces a wrong clamped ratio. The resolver must fall through to
  // textItems in that case. NOT captured by the invariant tests above —
  // those use dims={1000,1000} so contextItem always fits, meaning their
  // spotlightCenterRatio mirrors the resolver formula exactly.
  it("falls through to textItems when sourceContextDeepItem center exceeds evidence bounds", () => {
    // Mirrors the AsymmetricAnchorCitation Playwright fixture:
    //   sourceContextDeepItem.y = 790 in evidence height 120 → cy = 807 > 120 → page space
    //   textItem "installation" at x=280, width=100 → center 330/400 = 0.825
    // Broken (before fix): primary path returns x = 420/400 = 1.0 (clamped).
    const verification: Verification = {
      status: "found",
      verifiedSourceMatch: "installation",
      evidence: {
        src: "x",
        dimensions: { width: 400, height: 120 },
        textItems: [{ x: 280, y: 40, width: 100, height: 28, text: "installation" }],
      },
      document: {
        sourceContextDeepItem: {
          x: 140,
          y: 790,
          width: 560,
          height: 34,
          text: 'At YC we use the term "Collision installation" for the technique they invented.',
        },
      },
    };
    const anchor = resolveEvidenceSourceAnchorRatio(verification);
    expect(anchor?.x).toBeCloseTo(0.825, 2);
    expect(anchor?.y).toBeCloseTo(0.45, 2);
  });

  it("sourceContextDeepItem wins over verifiedSourceMatch when both exact-match different items", () => {
    // Both targets have exact-match items, but at different positions. The
    // spotlight is on sourceContextDeepItem's bbox, so the anchor must pick
    // that item — even if verifiedSourceMatch's item scores higher by length.
    // This catches the class of bug where a page has a stray header/footer
    // repeating the verifiedSourceMatch phrase above or below the real citation.
    const verification: Verification = {
      status: "found",
      // Shorter text → higher score because tier-3 score = 4000 + text.length.
      // Actually: verifiedSourceMatch is LONGER here, making its score higher
      // and steering winningTarget away from sourceContextDeepItem.
      verifiedSourceMatch: "the document verifies everything as correct always",
      evidence: {
        src: "x",
        dimensions: { width: 1000, height: 1000 },
        textItems: [
          // Stray header item matching verifiedSourceMatch (outside the citation area).
          { x: 50, y: 50, width: 600, height: 20, text: "the document verifies everything as correct always" },
          // The real citation item matching sourceContextDeepItem at y=700.
          { x: 100, y: 700, width: 400, height: 20, text: "shorter citation line" },
        ],
      },
      document: {
        sourceContextDeepItem: {
          x: 100,
          y: 700,
          width: 400,
          height: 20,
          text: "shorter citation line",
        },
      },
    };
    const ratio = resolveEvidenceSourceAnchorRatio(verification);
    // Spotlight at y=710 → ratio 0.71. Current bug: picks the LONGER
    // verifiedSourceMatch exact match (score 4050 vs 4021) → y=60 → 0.06.
    expect(ratio?.y).toBeCloseTo(0.71, 2);
  });
});
