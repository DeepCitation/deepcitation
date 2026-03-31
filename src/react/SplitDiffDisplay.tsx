import type React from "react";
import { memo, useMemo, useState } from "react";
import type { SearchStatus } from "../types/search.js";
import { fuzzyAnchorRange } from "../utils/fuzzyAnchor.js";
import { useTranslation } from "./i18n.js";
import { CheckIcon } from "./icons.js";
import { cn } from "./utils.js";

// =============================================================================
// TYPES
// =============================================================================

export type DiffDisplayMode = "auto" | "inline" | "split";

export interface SplitDiffDisplayProps {
  /** The expected/claimed text from the AI */
  expected: string;
  /** The actual text found in the source */
  actual: string;
  /** Optional label for the diff section */
  label?: string;
  /** Additional class name */
  className?: string;
  /** Sanitize function for text preprocessing */
  sanitize?: (text: string) => string;
  /** Display mode: auto (smart), inline (word diff), or split (two-row) */
  mode?: DiffDisplayMode;
  /** Show a match quality indicator bar */
  showMatchQuality?: boolean;
  /** Maximum characters before collapsing with "Show more" */
  maxCollapsedLength?: number;
  /** Expected anchorText to highlight within expected text */
  anchorTextExpected?: string;
  /** Found anchorText to highlight within actual text */
  anchorTextFound?: string;
  /** Verification status for contextual messages */
  status?: SearchStatus | null;
  /** Similarity score (0-1), calculated if not provided */
  similarity?: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  // Simple Levenshtein-based similarity
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }

  const distance = matrix[a.length][b.length];
  return 1 - distance / maxLen;
}

/**
 * Highlight a substring within text.
 * Falls back to case-insensitive then fuzzy word-span matching when exact match fails.
 */
function highlightSubstring(text: string, substring: string | undefined, highlightClass: string): React.ReactNode {
  if (!substring) return text;

  // Exact match
  let index = text.indexOf(substring);
  let matchLength = substring.length;

  // Case-insensitive fallback
  if (index === -1) {
    index = text.toLowerCase().indexOf(substring.toLowerCase());
  }

  // Fuzzy word-span fallback
  if (index === -1) {
    const range = fuzzyAnchorRange(text, substring);
    if (range) {
      index = range.start;
      matchLength = range.end - range.start;
    }
  }

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + matchLength);
  const after = text.slice(index + matchLength);

  return (
    <>
      {before}
      <span className={highlightClass}>{match}</span>
      {after}
    </>
  );
}

// =============================================================================
// MATCH QUALITY BAR COMPONENT
// =============================================================================

interface MatchQualityBarProps {
  similarity: number;
  className?: string;
}

const MatchQualityBar: React.FC<MatchQualityBarProps> = memo(({ similarity, className }) => {
  const percentage = Math.round(similarity * 100);
  const fillColor = percentage >= 80 ? "bg-dc-verified" : percentage >= 40 ? "bg-dc-partial" : "bg-dc-destructive";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-1.5 bg-dc-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-[250ms]", fillColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-[10px] font-medium text-dc-muted-foreground tabular-nums">{percentage}%</span>
    </div>
  );
});

MatchQualityBar.displayName = "MatchQualityBar";

// =============================================================================
// COLLAPSIBLE TEXT COMPONENT
// =============================================================================

interface CollapsibleTextProps {
  text: string;
  maxLength: number;
  className?: string;
  anchorText?: string;
  anchorTextClass?: string;
}

const CollapsibleText: React.FC<CollapsibleTextProps> = memo(
  ({ text, maxLength, className, anchorText, anchorTextClass = "border-b-2 border-dc-primary" }) => {
    const t = useTranslation();
    const [isExpanded, setIsExpanded] = useState(false);
    const shouldCollapse = text.length > maxLength;

    const displayText = shouldCollapse && !isExpanded ? `${text.slice(0, maxLength)}…` : text;

    const content = anchorText ? highlightSubstring(displayText, anchorText, anchorTextClass) : displayText;

    return (
      <div className={className}>
        <span className="whitespace-pre-wrap break-words">{content}</span>
        {shouldCollapse && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="ml-1 text-dc-primary hover:text-dc-primary/80 text-[10px] font-medium"
          >
            {isExpanded ? t("diff.showLess") : t("diff.showFullText")}
          </button>
        )}
      </div>
    );
  },
);

CollapsibleText.displayName = "CollapsibleText";

// =============================================================================
// SPLIT VIEW COMPONENT
// =============================================================================

interface SplitViewProps {
  expected: string;
  actual: string;
  maxCollapsedLength: number;
  anchorTextExpected?: string;
  anchorTextFound?: string;
  showMatchQuality?: boolean;
  similarity: number;
}

const SplitView: React.FC<SplitViewProps> = memo(
  ({ expected, actual, maxCollapsedLength, anchorTextExpected, anchorTextFound, showMatchQuality, similarity }) => {
    const t = useTranslation();
    return (
      <div className="space-y-2">
        {showMatchQuality && <MatchQualityBar similarity={similarity} className="mb-3" />}

        {/* Expected row */}
        <div className="rounded-dc-md overflow-hidden">
          <div className="flex items-start gap-2 p-2.5 bg-dc-destructive-bg">
            <span className="shrink-0 text-[10px] font-medium text-dc-destructive uppercase tracking-wide pt-0.5">
              {t("diff.expectedLabel")}
            </span>
            <CollapsibleText
              text={expected}
              maxLength={maxCollapsedLength}
              className="flex-1 font-mono text-[11px] text-dc-destructive"
              anchorText={anchorTextExpected}
              anchorTextClass="bg-dc-destructive/20 px-0.5 rounded"
            />
          </div>
        </div>

        {/* Found row */}
        <div className="rounded-dc-md overflow-hidden">
          <div className="flex items-start gap-2 p-2.5 bg-dc-verified-bg">
            <span className="shrink-0 text-[10px] font-medium text-dc-verified uppercase tracking-wide pt-0.5 inline-flex items-center gap-1">
              {t("diff.foundLabel")}
              <span className="size-2.5 text-dc-verified">
                <CheckIcon />
              </span>
            </span>
            {actual ? (
              <CollapsibleText
                text={actual}
                maxLength={maxCollapsedLength}
                className="flex-1 font-mono text-[11px] text-dc-verified"
                anchorText={anchorTextFound}
                anchorTextClass="bg-dc-verified/20 px-0.5 rounded"
              />
            ) : (
              <span className="flex-1 font-mono text-[11px] text-dc-muted-foreground italic">
                {t("misc.noTextFound")}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  },
);

SplitView.displayName = "SplitView";

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * SplitDiffDisplay - Enhanced diff display with split view mode
 *
 * Features:
 * - Auto mode: intelligently chooses inline or split based on similarity
 * - Split view: clear two-row Expected/Found layout for high-variance diffs
 * - KeySpan highlighting: underlines matching portions
 * - Match quality bar: visual similarity indicator
 * - Collapsible text: truncates long text with expand option
 */
export const SplitDiffDisplay: React.FC<SplitDiffDisplayProps> = memo(
  ({
    expected,
    actual,
    label,
    className,
    sanitize,
    mode = "auto",
    showMatchQuality = false,
    maxCollapsedLength = 200,
    anchorTextExpected,
    anchorTextFound,
    status,
    similarity: providedSimilarity,
  }) => {
    const t = useTranslation();
    // Sanitize inputs
    const sanitizedExpected = useMemo(() => {
      const clean = (expected || "").trim().replace(/\r\n/g, "\n");
      return sanitize ? sanitize(clean) : clean;
    }, [expected, sanitize]);

    const sanitizedActual = useMemo(() => {
      const clean = (actual || "").trim().replace(/\r\n/g, "\n");
      return sanitize ? sanitize(clean) : clean;
    }, [actual, sanitize]);

    // Calculate similarity
    const similarity = useMemo(() => {
      if (providedSimilarity !== undefined) return providedSimilarity;
      return calculateSimilarity(sanitizedExpected, sanitizedActual);
    }, [sanitizedExpected, sanitizedActual, providedSimilarity]);

    // Determine effective display mode
    const effectiveMode = useMemo(() => {
      if (mode !== "auto") return mode;

      // Smart mode selection based on PRD thresholds
      if (similarity >= 0.8) return "inline";
      if (similarity < 0.6) return "split";

      // For status-based decisions
      if (status === "found_anchor_text_only" || status === "partial_text_found") {
        return "split";
      }

      // Default to split for moderate variance (0.6-0.8) when showing diff
      return "split";
    }, [mode, similarity, status]);

    // Check if exact match
    const isExactMatch = sanitizedExpected === sanitizedActual && sanitizedExpected.length > 0;

    if (isExactMatch) {
      return (
        <div data-testid="split-diff-display" data-exact-match="true" className={cn("space-y-2", className)}>
          {label && <div className="text-xs font-medium text-dc-muted-foreground uppercase tracking-wide">{label}</div>}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-dc-verified/10 text-dc-verified rounded-full text-sm font-medium">
            <span className="size-2.5">
              <CheckIcon />
            </span>
            <span>{t("outcome.exactMatch")}</span>
          </div>
          <div className="p-3 bg-dc-muted rounded-dc-md text-sm text-dc-foreground font-mono whitespace-pre-wrap break-words">
            {sanitizedActual}
          </div>
        </div>
      );
    }

    return (
      <div data-testid="split-diff-display" data-mode={effectiveMode} className={cn("space-y-2", className)}>
        {label && <div className="text-xs font-medium text-dc-muted-foreground uppercase tracking-wide">{label}</div>}

        <SplitView
          expected={sanitizedExpected}
          actual={sanitizedActual}
          maxCollapsedLength={maxCollapsedLength}
          anchorTextExpected={anchorTextExpected}
          anchorTextFound={anchorTextFound}
          showMatchQuality={showMatchQuality}
          similarity={similarity}
        />
      </div>
    );
  },
);

SplitDiffDisplay.displayName = "SplitDiffDisplay";

export { CollapsibleText, MatchQualityBar };
