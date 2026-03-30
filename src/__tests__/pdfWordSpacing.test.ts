import type { PdfTextItem } from "@filelasso/shared";
import { createPdfLine } from "@filelasso/shared";
import { describe, expect, it } from "@jest/globals";

/** Helper: create a PdfTextItem at position (x, y) with given width and font size. */
function mockItem(text: string, x: number, y: number, width: number, fontSize: number = 10): PdfTextItem {
  return {
    str: text,
    dir: "ltr",
    transform: [fontSize, 0, 0, fontSize, x, y],
    width,
    height: fontSize,
    fontName: "test",
    hasEOL: false,
  } as PdfTextItem;
}

describe("createPdfLine word spacing", () => {
  it("inserts spaces between words at normal body text size (10pt)", () => {
    // Simulates "segregation in education" — three items with ~3pt gaps (typical word space for 10pt font)
    const items: PdfTextItem[] = [
      mockItem("segregation", 50, 700, 55, 10),
      mockItem("in", 108, 700, 10, 10), // gap = 108 - (50+55) = 3pt
      mockItem("education", 121, 700, 45, 10), // gap = 121 - (108+10) = 3pt
    ];
    const line = createPdfLine(items);
    expect(line.text).toBe("segregation in education");
  });

  it("inserts spaces between words at 12pt font size", () => {
    // 12pt font, ~3.5pt gaps between words
    const items: PdfTextItem[] = [
      mockItem("the", 50, 700, 20, 12),
      mockItem("doctrine", 73.5, 700, 50, 12), // gap = 3.5pt
      mockItem("of", 127, 700, 14, 12), // gap = 3.5pt
    ];
    const line = createPdfLine(items);
    expect(line.text).toBe("the doctrine of");
  });

  it("does NOT insert space for tight kerning pairs", () => {
    // "AV" kerned pair — items overlap slightly or have near-zero gap
    const items: PdfTextItem[] = [
      mockItem("A", 50, 700, 7, 10),
      mockItem("V", 56.5, 700, 7, 10), // gap = 56.5 - 57 = -0.5pt (overlap from kerning)
    ];
    const line = createPdfLine(items);
    expect(line.text).toBe("AV");
  });

  it("does NOT insert space within tightly-set ligature groups", () => {
    // Items with < 1pt gap — should NOT get a space
    const items: PdfTextItem[] = [
      mockItem("fi", 50, 700, 6, 10),
      mockItem("rst", 56.5, 700, 15, 10), // gap = 0.5pt, well below 10*0.2 = 2pt threshold
    ];
    const line = createPdfLine(items);
    expect(line.text).toBe("first");
  });

  it("inserts space for large headings (24pt font)", () => {
    // 24pt heading — word space ~6-8pt, threshold = 24*0.2 = 4.8pt
    const items: PdfTextItem[] = [
      mockItem("BROWN", 50, 700, 80, 24),
      mockItem("v.", 137, 700, 20, 24), // gap = 137 - 130 = 7pt > 4.8pt threshold
      mockItem("BOARD", 164, 700, 80, 24), // gap = 164 - 157 = 7pt
    ];
    const line = createPdfLine(items);
    expect(line.text).toBe("BROWN v. BOARD");
  });

  it("handles the old failure case: fused legal text", () => {
    // This simulates the Brown v. Board pattern where 10pt body text
    // had ~2-3pt gaps that the old threshold=12 completely missed
    const items: PdfTextItem[] = [
      mockItem("separate", 50, 700, 40, 10),
      mockItem("but", 93, 700, 15, 10), // gap = 3pt
      mockItem("equal", 111, 700, 25, 10), // gap = 3pt
      mockItem("has", 139, 700, 15, 10), // gap = 3pt
      mockItem("no", 157, 700, 10, 10), // gap = 3pt
      mockItem("place", 170, 700, 25, 10), // gap = 3pt
    ];
    const line = createPdfLine(items);
    expect(line.text).toBe("separate but equal has no place");
  });

  it("handles mixed font sizes on same line (e.g. footnote markers)", () => {
    // Main text at 10pt, superscript footnote at 6pt
    const items: PdfTextItem[] = [
      mockItem("education", 50, 700, 45, 10),
      mockItem("5", 98, 703, 4, 6), // gap = 3pt, superscript footnote
    ];
    const line = createPdfLine(items);
    // Should insert space — gap of 3pt > 6*0.2=1.2pt threshold
    expect(line.text).toBe("education 5");
  });

  it("returns empty text for empty input", () => {
    const line = createPdfLine([]);
    expect(line.text).toBe("");
  });

  it("handles items with trailing spaces in str (sanitized away)", () => {
    // Some PDFs include trailing spaces in the str field.
    // sanitizeText strips them, so spacing depends on the positional gap.
    // Here gap = 72 - (50+22) = 0pt, below threshold — no space inserted.
    const items: PdfTextItem[] = [mockItem("the ", 50, 700, 22, 10), mockItem("court", 72, 700, 25, 10)];
    const line = createPdfLine(items);
    expect(line.text).toBe("thecourt");
  });
});
