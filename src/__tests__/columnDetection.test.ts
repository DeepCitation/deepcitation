import { describe, expect, it } from "@jest/globals";
import { detectColumns } from "@filelasso/shared";
import type { PdfTextItem } from "@filelasso/shared";

/** Helper: create a mock PdfTextItem at position (x, y) with given width. */
function mockItem(x: number, y: number, width: number, text: string = "word"): PdfTextItem {
  return {
    str: text,
    dir: "ltr",
    transform: [1, 0, 0, 1, x, y], // [scaleX, skewX, skewY, scaleY, translateX, translateY]
    width,
    height: 12,
    fontName: "test",
    hasEOL: false,
  } as PdfTextItem;
}

describe("detectColumns", () => {
  it("returns null for single-column layout", () => {
    // All items in one vertical strip: x ∈ [50, 300]
    const items: PdfTextItem[] = [
      mockItem(50, 700, 250, "This is a single column line"),
      mockItem(50, 685, 200, "Another line in the same column"),
      mockItem(50, 670, 230, "Yet another line of text here"),
      mockItem(50, 655, 180, "More text in single column"),
      mockItem(50, 640, 210, "Final line of the paragraph"),
    ];
    expect(detectColumns(items)).toBeNull();
  });

  it("detects two columns in a typical PDF layout", () => {
    // Left column: x ∈ [50, 280], right column: x ∈ [320, 550]
    // Gap from 280 to 320 = 40px > minGap(30)
    const items: PdfTextItem[] = [
      // Left column
      mockItem(50, 700, 230, "Left column line 1"),
      mockItem(50, 685, 200, "Left column line 2"),
      mockItem(50, 670, 210, "Left column line 3"),
      mockItem(50, 655, 220, "Left column line 4"),
      // Right column
      mockItem(320, 700, 230, "Right column line 1"),
      mockItem(320, 685, 200, "Right column line 2"),
      mockItem(320, 670, 210, "Right column line 3"),
      mockItem(320, 655, 220, "Right column line 4"),
    ];
    const columns = detectColumns(items);
    expect(columns).not.toBeNull();
    expect(columns).toHaveLength(2);
    expect(columns![0].left).toBeLessThan(columns![1].left);
  });

  it("returns null when gap is too narrow", () => {
    // Left: x ∈ [50, 280], right: x ∈ [295, 525] — gap = 15px < minGap(30)
    const items: PdfTextItem[] = [
      mockItem(50, 700, 230),
      mockItem(50, 685, 230),
      mockItem(50, 670, 230),
      mockItem(50, 655, 230),
      mockItem(295, 700, 230),
      mockItem(295, 685, 230),
      mockItem(295, 670, 230),
      mockItem(295, 655, 230),
    ];
    expect(detectColumns(items)).toBeNull();
  });

  it("returns null for too few items", () => {
    const items: PdfTextItem[] = [
      mockItem(50, 700, 200),
      mockItem(350, 700, 200),
    ];
    expect(detectColumns(items)).toBeNull();
  });

  it("detects three columns", () => {
    // Three columns with clear gaps
    const items: PdfTextItem[] = [
      // Col 1: x ∈ [30, 170]
      mockItem(30, 700, 140), mockItem(30, 685, 130), mockItem(30, 670, 140),
      mockItem(30, 655, 135),
      // Col 2: x ∈ [220, 360]
      mockItem(220, 700, 140), mockItem(220, 685, 130), mockItem(220, 670, 140),
      mockItem(220, 655, 135),
      // Col 3: x ∈ [410, 550]
      mockItem(410, 700, 140), mockItem(410, 685, 130), mockItem(410, 670, 140),
      mockItem(410, 655, 135),
    ];
    const columns = detectColumns(items);
    expect(columns).not.toBeNull();
    expect(columns).toHaveLength(3);
  });

  it("handles real-world CDC immunization schedule pattern", () => {
    // Simulates a two-column table with header spanning full width
    // Headers at y=750, left column at x=50, right column at x=350
    const items: PdfTextItem[] = [
      // Full-width header
      mockItem(50, 750, 500, "RECOMMENDED IMMUNIZATION SCHEDULE"),
      // Left column
      mockItem(50, 700, 200, "Hepatitis B"),
      mockItem(50, 685, 200, "Rotavirus"),
      mockItem(50, 670, 200, "DTaP"),
      mockItem(50, 655, 200, "Hib"),
      mockItem(50, 640, 200, "PCV13"),
      // Right column
      mockItem(350, 700, 200, "IPV"),
      mockItem(350, 685, 200, "Influenza"),
      mockItem(350, 670, 200, "MMR"),
      mockItem(350, 655, 200, "Varicella"),
      mockItem(350, 640, 200, "Hepatitis A"),
    ];
    const columns = detectColumns(items);
    // Should detect 2 columns despite the full-width header
    // (The header bridges the gap but the majority of items form 2 clusters)
    expect(columns).not.toBeNull();
    if (columns) {
      expect(columns.length).toBeGreaterThanOrEqual(2);
    }
  });
});
