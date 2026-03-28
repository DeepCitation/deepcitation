import type { Citation, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

export type MarkdownVariant =
  | "inline" // "Revenue grew 45%✓" - text with inline indicator
  | "brackets" // "[1✓]" - bracketed number with indicator
  | "superscript" // "¹✓" - unicode superscript number
  | "footnote" // "[^1]" - markdown footnote syntax with reference section
  | "academic"; // "(Source, p.5)✓" - academic citation style

export type IndicatorStyle =
  | "check" // ✓ ⚠ ✗ ◌  (clean, universal unicode - DEFAULT)
  | "semantic" // ✓ ~ ✗ …  (tilde for partial, ellipsis for pending)
  | "circle" // ● ◐ ○ ◌  (filled/half/empty circles)
  | "square" // ■ ▪ □ ▫  (squares for monospace alignment)
  | "letter" // V P X ?  (single letters, ASCII-safe)
  | "word" // ✓verified ⚠partial ✗missed ◌pending
  | "none"; // No indicator

/** Humanized line position for location mismatches. */
export type LinePosition = "start" | "early" | "middle" | "late" | "end";

export interface RenderMarkdownOptions {
  showPageNumber?: boolean;
  showLinePosition?: boolean;
}

export interface CitationWithStatus {
  citation: Citation;
  citationKey: string;
  verification: Verification | null;
  status: CitationStatus;
  displayText: string;
  citationNumber: number;
}

export interface IndicatorSet {
  verified: string;
  partial: string;
  notFound: string;
  pending: string;
}

export const INDICATOR_SETS: Record<IndicatorStyle, IndicatorSet> = {
  check: { verified: "✓", partial: "⚠", notFound: "✗", pending: "◌" },
  semantic: { verified: "✓", partial: "~", notFound: "✗", pending: "…" },
  circle: { verified: "●", partial: "◐", notFound: "○", pending: "◌" },
  square: { verified: "■", partial: "▪", notFound: "□", pending: "▫" },
  letter: { verified: "V", partial: "P", notFound: "X", pending: "?" },
  word: {
    verified: "✓verified",
    partial: "⚠partial",
    notFound: "✗missed",
    pending: "◌pending",
  },
  none: { verified: "", partial: "", notFound: "", pending: "" },
};

export const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
