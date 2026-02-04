import type { Citation, CitationRecord, VerificationRecord, CitationStatus } from "../types/citation.js";
import type { Verification } from "../types/verification.js";

/**
 * Markdown output variants for citation display.
 * Analogous to React CitationComponent variants but for static markdown.
 */
export type MarkdownVariant =
  | "inline"      // "Revenue grew 45%✓" - text with inline indicator
  | "brackets"    // "[1✓]" - bracketed number with indicator
  | "superscript" // "¹✓" - unicode superscript number
  | "footnote"    // "[^1]" - markdown footnote syntax with reference section
  | "academic"    // "(Source, p.5)✓" - academic citation style
  | "minimal";    // Just "✓" - indicator only

/**
 * Indicator styles for verification status.
 *
 * Design considerations:
 * - Terminal compatibility (some emojis render poorly)
 * - Visual distinction between states
 * - Character width consistency
 * - Copy/paste friendliness
 */
export type IndicatorStyle =
  | "check"       // ✓ ⚠ ✗ ◌  (clean, universal unicode - DEFAULT)
  | "semantic"    // ✓ ~ ✗ …  (tilde for partial, ellipsis for pending)
  | "circle"      // ● ◐ ○ ◌  (filled/half/empty circles)
  | "square"      // ■ ▪ □ ▫  (squares for monospace alignment)
  | "letter"      // V P X ?  (single letters, ASCII-safe)
  | "word"        // ✓verified ⚠partial ✗missed ◌pending
  | "none";       // No indicator

/**
 * Humanized line position for location mismatches.
 * Used instead of raw line IDs which are internal-only.
 */
export type LinePosition = "start" | "early" | "middle" | "late" | "end";

/**
 * Options for rendering citations as markdown.
 */
export interface RenderMarkdownOptions {
  /** Output variant style (default: "inline") */
  variant?: MarkdownVariant;

  /** Verification indicator style (default: "check") */
  indicatorStyle?: IndicatorStyle;

  /** Verifications keyed by citationKey */
  verifications?: VerificationRecord;

  /** Include reference section at end of document (default: false) */
  includeReferences?: boolean;

  /** Reference section heading (default: "## References") */
  referenceHeading?: string;

  /** Show verification reasoning in references (default: false) */
  showReasoning?: boolean;

  /** Show page number in references (default: true) */
  showPageNumber?: boolean;

  /** Show humanized line position for mismatches, e.g., "expected early, found middle" (default: true) */
  showLinePosition?: boolean;

  /** Custom source labels by attachmentId */
  sourceLabels?: Record<string, string>;

  /** Link style for citations (default: "anchor") */
  linkStyle?: "anchor" | "none";
  // Phase 2 will add: | "external"

  // === PHASE 2 (reserved, not implemented) ===
  // shareUrls?: Record<string, string>;
}

/**
 * Structured output from markdown rendering.
 */
export interface MarkdownOutput {
  /** The rendered markdown text (citations replaced with indicators) */
  markdown: string;

  /** Citation reference section (if includeReferences is true) */
  references?: string;

  /** Full markdown with references appended */
  full: string;

  /** Extracted citations with their verification status */
  citations: CitationWithStatus[];
}

/**
 * Citation paired with its verification status for output.
 */
export interface CitationWithStatus {
  /** The original citation */
  citation: Citation;

  /** Citation key (hash) for matching with verifications */
  citationKey: string;

  /** Verification result (may be null if not verified) */
  verification: Verification | null;

  /** Computed verification status */
  status: CitationStatus;

  /** Display text used in the markdown output */
  displayText: string;

  /** Citation number for reference */
  citationNumber: number;
}

/**
 * Indicator characters for each style and status.
 */
export interface IndicatorSet {
  verified: string;
  partial: string;
  notFound: string;
  pending: string;
}

/**
 * All indicator sets by style.
 */
export const INDICATOR_SETS: Record<IndicatorStyle, IndicatorSet> = {
  check: { verified: "✓", partial: "⚠", notFound: "✗", pending: "◌" },
  semantic: { verified: "✓", partial: "~", notFound: "✗", pending: "…" },
  circle: { verified: "●", partial: "◐", notFound: "○", pending: "◌" },
  square: { verified: "■", partial: "▪", notFound: "□", pending: "▫" },
  letter: { verified: "V", partial: "P", notFound: "X", pending: "?" },
  word: { verified: "✓verified", partial: "⚠partial", notFound: "✗missed", pending: "◌pending" },
  none: { verified: "", partial: "", notFound: "", pending: "" },
};

/**
 * Unicode superscript digits for superscript variant.
 */
export const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
