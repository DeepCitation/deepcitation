import { expect, test } from "@playwright/experimental-ct-react";
import { BOX_PADDING, SPOTLIGHT_PADDING } from "../../../src/drawing/citationDrawing";
import { CitationAnnotationOverlay } from "../../../src/react/CitationAnnotationOverlay";
import type { DeepTextItem } from "../../../src/types/boxes";

// =============================================================================
// TEST FIXTURES
// =============================================================================

// 800×1600 image, renderScale 1:1 — PDF coords = image pixels.
const IMAGE_W = 800;
const IMAGE_H = 1600;
const RENDER_SCALE = { x: 1, y: 1 };

// Phrase item in PDF coords (y is bottom-up).
// toPercentRect flips: imageY = 1600 - 200 = 1400
// Expected CSS: left=12.5%, top=87.5%, width=50%, height=1.25%
const PHRASE_ITEM: DeepTextItem = {
  x: 100,
  y: 200,
  width: 400,
  height: 20,
  text: "Functional status: He is at baseline, no assistance needed, independent ADLs",
};

// Anchor item — different text, different bounding box.
// Expected CSS: left=15%, top=87.5%, width=18.75%, height=1.25%
const ANCHOR_ITEM: DeepTextItem = {
  x: 120,
  y: 200,
  width: 150,
  height: 20,
  text: "Functional status",
};

// =============================================================================
// EXPECTED VALUES — from src/drawing/citationDrawing.ts
// =============================================================================

// getBracketWidth(20) = max(4, min(20 * 0.2, 12)) = 4
const EXPECTED_BRACKET_WIDTH = "4px";
// CITATION_LINE_BORDER_WIDTH = 2
const EXPECTED_BORDER_WIDTH = "2px";
// SIGNAL_BLUE #005595 → rgb(0, 85, 149)
const EXPECTED_BLUE_RGB = "rgb(0, 85, 149)";
// SIGNAL_AMBER #fbbf24 → rgb(251, 191, 36)
const EXPECTED_AMBER_RGB = "rgb(251, 191, 36)";

// =============================================================================
// DRAWING CORRECTNESS — element rendering
// =============================================================================

test.describe("Annotation Overlay Drawing — elements", () => {
  test("renders spotlight, brackets, and anchor highlight with correct structure", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
          anchorTextDeepItem={ANCHOR_ITEM}
          anchorText="Functional status"
          fullPhrase="Functional status: He is at baseline, no assistance needed, independent ADLs"
        />
      </div>,
    );

    const overlay = page.locator("[data-dc-annotation-overlay]");
    await expect(overlay).toBeVisible();
    await expect(overlay.locator("[data-dc-spotlight]")).toBeVisible();
    await expect(overlay.locator("[data-dc-bracket-left]")).toBeVisible();
    await expect(overlay.locator("[data-dc-bracket-right]")).toBeVisible();
    await expect(overlay.locator("[data-dc-anchor-highlight]")).toBeVisible();
  });

  test("returns null (no overlay) when renderScale is zero (invalid geometry)", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={{ x: 0, y: 0 }}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
        />
      </div>,
    );

    // toPercentRect returns null for zero renderScale → component returns null
    await expect(page.locator("[data-dc-annotation-overlay]")).toHaveCount(0);
  });
});

// =============================================================================
// DRAWING CORRECTNESS — bracket colors
// =============================================================================

test.describe("Annotation Overlay Drawing — bracket colors", () => {
  test("brackets use blue color by default (no highlightColor prop)", async ({ mount, page }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
        />
      </div>,
    );

    const leftBracket = page.locator("[data-dc-bracket-left]");
    await expect(leftBracket).toBeVisible();

    const borderColor = await leftBracket.evaluate(
      el => getComputedStyle(el).borderLeftColor,
    );
    expect(borderColor).toBe(EXPECTED_BLUE_RGB);
  });

  test("brackets use blue color when highlightColor='blue'", async ({ mount, page }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
          highlightColor="blue"
        />
      </div>,
    );

    const leftBracket = page.locator("[data-dc-bracket-left]");
    const rightBracket = page.locator("[data-dc-bracket-right]");

    const leftColor = await leftBracket.evaluate(el => getComputedStyle(el).borderLeftColor);
    const rightColor = await rightBracket.evaluate(el => getComputedStyle(el).borderRightColor);
    expect(leftColor).toBe(EXPECTED_BLUE_RGB);
    expect(rightColor).toBe(EXPECTED_BLUE_RGB);
  });

  test("brackets use amber color when highlightColor='amber'", async ({ mount, page }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
          highlightColor="amber"
        />
      </div>,
    );

    const leftBracket = page.locator("[data-dc-bracket-left]");
    const rightBracket = page.locator("[data-dc-bracket-right]");

    const leftColor = await leftBracket.evaluate(el => getComputedStyle(el).borderLeftColor);
    const rightColor = await rightBracket.evaluate(el => getComputedStyle(el).borderRightColor);
    expect(leftColor).toBe(EXPECTED_AMBER_RGB);
    expect(rightColor).toBe(EXPECTED_AMBER_RGB);
  });
});

// =============================================================================
// DRAWING CORRECTNESS — bracket geometry
// =============================================================================

test.describe("Annotation Overlay Drawing — bracket geometry", () => {
  test("bracket border widths match CITATION_LINE_BORDER_WIDTH (2px)", async ({ mount, page }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
        />
      </div>,
    );

    const leftBracket = page.locator("[data-dc-bracket-left]");
    const rightBracket = page.locator("[data-dc-bracket-right]");

    // Left bracket: borderLeft, borderTop, borderBottom should be 2px
    const leftStyles = await leftBracket.evaluate(el => {
      const s = getComputedStyle(el);
      return {
        borderLeftWidth: s.borderLeftWidth,
        borderTopWidth: s.borderTopWidth,
        borderBottomWidth: s.borderBottomWidth,
        borderRightWidth: s.borderRightWidth,
      };
    });
    expect(leftStyles.borderLeftWidth).toBe(EXPECTED_BORDER_WIDTH);
    expect(leftStyles.borderTopWidth).toBe(EXPECTED_BORDER_WIDTH);
    expect(leftStyles.borderBottomWidth).toBe(EXPECTED_BORDER_WIDTH);
    // Left bracket should have no right border
    expect(leftStyles.borderRightWidth).toBe("0px");

    // Right bracket: borderRight, borderTop, borderBottom should be 2px
    const rightStyles = await rightBracket.evaluate(el => {
      const s = getComputedStyle(el);
      return {
        borderRightWidth: s.borderRightWidth,
        borderTopWidth: s.borderTopWidth,
        borderBottomWidth: s.borderBottomWidth,
        borderLeftWidth: s.borderLeftWidth,
      };
    });
    expect(rightStyles.borderRightWidth).toBe(EXPECTED_BORDER_WIDTH);
    expect(rightStyles.borderTopWidth).toBe(EXPECTED_BORDER_WIDTH);
    expect(rightStyles.borderBottomWidth).toBe(EXPECTED_BORDER_WIDTH);
    // Right bracket should have no left border
    expect(rightStyles.borderLeftWidth).toBe("0px");
  });

  test("bracket width matches getBracketWidth(heightPx) = 4px for 20px height", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
        />
      </div>,
    );

    const leftBracket = page.locator("[data-dc-bracket-left]");
    const width = await leftBracket.evaluate(el => getComputedStyle(el).width);
    expect(width).toBe(EXPECTED_BRACKET_WIDTH);
  });

  test("bracket width scales with item height (larger item → wider bracket, capped at 12px)", async ({
    mount,
    page,
  }) => {
    // Height=80 → getBracketWidth(80) = max(4, min(80*0.2, 12)) = max(4, min(16, 12)) = 12
    const tallItem: DeepTextItem = { ...PHRASE_ITEM, height: 80 };

    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={tallItem}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
        />
      </div>,
    );

    const leftBracket = page.locator("[data-dc-bracket-left]");
    const width = await leftBracket.evaluate(el => getComputedStyle(el).width);
    expect(width).toBe("12px");
  });
});

// =============================================================================
// DRAWING CORRECTNESS — spotlight overlay
// =============================================================================

test.describe("Annotation Overlay Drawing — spotlight", () => {
  test("spotlight box-shadow uses OVERLAY_COLOR (rgba(26, 26, 26, 0.4))", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
        />
      </div>,
    );

    const spotlight = page.locator("[data-dc-spotlight]");
    const boxShadow = await spotlight.evaluate(el => getComputedStyle(el).boxShadow);

    // Browser normalizes rgba(26, 26, 26, 0.4) in box-shadow
    expect(boxShadow).toContain("rgba(26, 26, 26, 0.4)");
    expect(boxShadow).toContain("9999px");
  });

  test("spotlight position uses larger padding (BOX_PADDING + SPOTLIGHT_PADDING)", async ({ mount, page }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
        />
      </div>,
    );

    const spotlight = page.locator("[data-dc-spotlight]");
    const styles = await spotlight.evaluate(el => ({
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height),
    }));

    // Base percent: left=12.5%, top=87.5%, width=50%, height=1.25%
    // Spotlight padding = BOX_PADDING + SPOTLIGHT_PADDING = 26px
    const totalPad = BOX_PADDING + SPOTLIGHT_PADDING;
    const spotPadX = (totalPad / IMAGE_W) * 100;
    const spotPadY = (totalPad / IMAGE_H) * 100;
    expect(styles.left).toBeCloseTo(12.5 - spotPadX, 5);
    expect(styles.top).toBeCloseTo(87.5 - spotPadY, 5);
    expect(styles.width).toBeCloseTo(50 + 2 * spotPadX, 5);
    expect(styles.height).toBeCloseTo(1.25 + 2 * spotPadY, 5);
  });

  test("spotlight rect is larger than bracket rect by SPOTLIGHT_PADDING on each side", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
        />
      </div>,
    );

    const spotlight = page.locator("[data-dc-spotlight]");
    const leftBracket = page.locator("[data-dc-bracket-left]");

    const spotStyles = await spotlight.evaluate(el => ({
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height),
    }));
    const bracketStyles = await leftBracket.evaluate(el => ({
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      height: parseFloat(el.style.height),
    }));

    // The gap between bracket edge and spotlight edge = SPOTLIGHT_PADDING pixels
    const gapXPct = (SPOTLIGHT_PADDING / IMAGE_W) * 100;
    const gapYPct = (SPOTLIGHT_PADDING / IMAGE_H) * 100;

    // Spotlight left is further left than bracket left by gapXPct
    expect(bracketStyles.left - spotStyles.left).toBeCloseTo(gapXPct, 5);
    // Spotlight top is further up than bracket top by gapYPct
    expect(bracketStyles.top - spotStyles.top).toBeCloseTo(gapYPct, 5);
  });

  test("brackets use BOX_PADDING (smaller offset from text rect)", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
        />
      </div>,
    );

    const leftBracket = page.locator("[data-dc-bracket-left]");
    const styles = await leftBracket.evaluate(el => ({
      left: el.style.left,
      top: el.style.top,
      height: el.style.height,
    }));

    // Bracket uses BOX_PADDING (2px), not the larger spotlight padding
    const padXPct = (BOX_PADDING / IMAGE_W) * 100;
    const padYPct = (BOX_PADDING / IMAGE_H) * 100;
    expect(styles.left).toBe(`${12.5 - padXPct}%`);
    expect(styles.top).toBe(`${87.5 - padYPct}%`);
    expect(styles.height).toBe(`${1.25 + 2 * padYPct}%`);
  });
});

// =============================================================================
// DRAWING CORRECTNESS — anchor highlight logic
// =============================================================================

test.describe("Annotation Overlay Drawing — anchor highlight", () => {
  test("anchor highlight renders with correct background color", async ({ mount, page }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
          anchorTextDeepItem={ANCHOR_ITEM}
          anchorText="Functional status"
          fullPhrase="Functional status: He is at baseline, no assistance needed, independent ADLs"
        />
      </div>,
    );

    const anchorHighlight = page.locator("[data-dc-anchor-highlight]");
    await expect(anchorHighlight).toBeVisible();

    const bgColor = await anchorHighlight.evaluate(
      el => getComputedStyle(el).backgroundColor,
    );
    // ANCHOR_HIGHLIGHT_COLOR = "rgba(251, 191, 36, 0.2)"
    expect(bgColor).toBe("rgba(251, 191, 36, 0.2)");
  });

  test("anchor highlight position matches anchor item percent rect", async ({ mount, page }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
          anchorTextDeepItem={ANCHOR_ITEM}
          anchorText="Functional status"
          fullPhrase="Functional status: He is at baseline, no assistance needed, independent ADLs"
        />
      </div>,
    );

    const anchorHighlight = page.locator("[data-dc-anchor-highlight]");
    const styles = await anchorHighlight.evaluate(el => ({
      left: el.style.left,
      top: el.style.top,
      width: el.style.width,
      height: el.style.height,
    }));

    // ANCHOR_ITEM: x=120, y=200, w=150, h=20
    // left=120/800=15%, top=1400/1600=87.5%, width=150/800=18.75%, height=20/1600=1.25%
    expect(styles.left).toBe("15%");
    expect(styles.top).toBe("87.5%");
    expect(styles.width).toBe("18.75%");
    expect(styles.height).toBe("1.25%");
  });

  test("anchor highlight hidden when anchorText and fullPhrase are identical text", async ({
    mount,
    page,
  }) => {
    const sameTextAnchor: DeepTextItem = {
      ...ANCHOR_ITEM,
      text: PHRASE_ITEM.text, // same text as phrase
    };

    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
          anchorTextDeepItem={sameTextAnchor}
          anchorText="Functional status"
          fullPhrase="Functional status" // same as anchorText → word diff < 2
        />
      </div>,
    );

    await expect(page.locator("[data-dc-anchor-highlight]")).toHaveCount(0);
  });

  test("anchor highlight hidden when word difference < 2 (3 words vs 2 words)", async ({
    mount,
    page,
  }) => {
    const shortAnchor: DeepTextItem = { ...ANCHOR_ITEM, text: "Functional status is" };

    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
          anchorTextDeepItem={shortAnchor}
          anchorText="Functional status"
          fullPhrase="Functional status is" // 3 words vs 2 → diff=1, below threshold for 2-word anchor
        />
      </div>,
    );

    await expect(page.locator("[data-dc-anchor-highlight]")).toHaveCount(0);
  });

  test("anchor highlight hidden when no anchorTextDeepItem is provided", async ({
    mount,
    page,
  }) => {
    await mount(
      <div style={{ position: "relative", width: `${IMAGE_W}px`, height: `${IMAGE_H}px` }}>
        <CitationAnnotationOverlay
          phraseMatchDeepItem={PHRASE_ITEM}
          renderScale={RENDER_SCALE}
          imageNaturalWidth={IMAGE_W}
          imageNaturalHeight={IMAGE_H}
          anchorText="Functional status"
          fullPhrase="Functional status: He is at baseline, no assistance needed, independent ADLs"
        />
      </div>,
    );

    // No anchorTextDeepItem → computeKeySpanHighlight has no item to compare
    await expect(page.locator("[data-dc-anchor-highlight]")).toHaveCount(0);
  });
});
