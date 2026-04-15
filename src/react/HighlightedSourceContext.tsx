import { useMemo } from "react";
import { shouldHighlightSourceMatch } from "../drawing/citationDrawing.js";
import { fuzzyAnchorRange } from "../utils/fuzzyAnchor.js";
import { normalizeQuotes } from "../utils/normalizeQuotes.js";
import { trimPhraseToAnchorWindow } from "../utils/textCleanup.js";
import { ANCHOR_HIGHLIGHT_STYLE } from "./constants.js";

/**
 * Renders sourceContext with optional sourceMatch highlighted using the same
 * amber highlight style used in the API-side proof images.
 * Only highlights when sourceContext has enough additional context beyond sourceMatch.
 * When isMiss is true, renders the phrase without highlighting (since the text wasn't found).
 *
 * Falls back to word-span fuzzy matching when the PDF text has extra inline
 * elements (e.g. section references) that break exact substring matching.
 *
 * When `isApproximate` is true, a small ≈ marker is rendered next to the highlight
 * span and turns amber when the highlight itself is hovered, signalling that the
 * cited text differs from what the model displayed inline.
 */
export function HighlightedSourceContext({
  sourceContext,
  sourceMatch,
  isMiss,
  isApproximate,
}: {
  sourceContext: string;
  sourceMatch?: string;
  isMiss?: boolean;
  isApproximate?: boolean;
}) {
  // Compute once per (sourceContext, sourceMatch) pair — trimming does two toLowerCase scans on
  // potentially large strings (full page dumps), so avoid repeating it on every render.
  const {
    text: displayPhrase,
    prefixTrimmed,
    suffixTrimmed,
  } = useMemo(() => trimPhraseToAnchorWindow(sourceContext, sourceMatch), [sourceContext, sourceMatch]);

  // Don't highlight when citation is "not found" - misleading to highlight text that wasn't found
  if (isMiss) {
    return (
      <span className="text-dc-destructive">
        {prefixTrimmed && "..."}
        {displayPhrase}
        {suffixTrimmed && "..."}
      </span>
    );
  }

  if (!sourceMatch || !shouldHighlightSourceMatch(sourceMatch, sourceContext)) {
    return (
      <span className="text-dc-muted-foreground">
        {prefixTrimmed && "..."}
        {displayPhrase}
        {suffixTrimmed && "..."}
      </span>
    );
  }

  // Prefer exact match; fall back to case-insensitive; then quote-normalized; then fuzzy.
  // normalizeQuotes is length-preserving so indices are valid on the original string.
  let start = displayPhrase.indexOf(sourceMatch);
  let end = start !== -1 ? start + sourceMatch.length : -1;

  if (start === -1) {
    const phraseLower = displayPhrase.toLowerCase();
    const anchorLower = sourceMatch.toLowerCase();
    start = phraseLower.indexOf(anchorLower);
    end = start !== -1 ? start + anchorLower.length : -1;

    // Quote-normalized fallback: OCR curly quotes vs ASCII anchor
    if (start === -1) {
      start = normalizeQuotes(phraseLower).indexOf(normalizeQuotes(anchorLower));
      end = start !== -1 ? start + anchorLower.length : -1;
    }
  }

  if (start === -1) {
    // Fuzzy: find the word-span within the phrase that covers the anchor text.
    // This handles PDF text with inserted citations like "(§6.1)" breaking exact match.
    const range = fuzzyAnchorRange(displayPhrase, sourceMatch);
    if (range) {
      start = range.start;
      end = range.end;
    }
  }

  if (start === -1) {
    return <span className="text-dc-muted-foreground">{displayPhrase}</span>;
  }

  // When the anchor IS the entire (possibly trimmed) phrase, fall through to
  // the highlight branch below. slice(0,0) and slice(end) become empty strings
  // so the highlight span wraps the whole phrase — the reader still gets a
  // visible signal that this snippet is the cited text. This matters most in
  // the no-image fallback popover, where normalizeSnippetText often collapses
  // the snippet to exactly the anchor for short citations.

  return (
    <span className="text-dc-muted-foreground">
      {prefixTrimmed && "..."}
      {displayPhrase.slice(0, start)}
      <span className="group/anchor">
        {isApproximate && (
          <span
            className="mr-0.5 text-dc-subtle-foreground group-hover/anchor:text-amber-500 dark:group-hover/anchor:text-amber-400 group-focus-within/anchor:text-amber-500 dark:group-focus-within/anchor:text-amber-400 motion-safe:transition-colors"
            aria-hidden="true"
          >
            ≈
          </span>
        )}
        <span style={ANCHOR_HIGHLIGHT_STYLE} className="text-dc-foreground">
          {displayPhrase.slice(start, end)}
        </span>
      </span>
      {displayPhrase.slice(end)}
      {suffixTrimmed && "..."}
    </span>
  );
}
