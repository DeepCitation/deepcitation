import { shouldHighlightAnchorText } from "../drawing/citationDrawing.js";
import { ANCHOR_HIGHLIGHT_STYLE } from "./constants.js";

/**
 * Find start/end indices in `phrase` that best cover `anchor` using word matching.
 * Returns null if fewer than 60% of anchor words are found.
 *
 * Handles cases like anchor="retrieval failure and generation bottleneck" inside
 * phrase="retrieval failure (§6.1) and generation bottleneck (§6.2)" where the
 * PDF has inserted inline section references that break exact substring matching.
 */
function fuzzyAnchorRange(phrase: string, anchor: string): { start: number; end: number } | null {
  const anchorWords = anchor
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ""))
    .filter(w => w.length >= 2);
  if (anchorWords.length === 0) return null;

  const phraseLower = phrase.toLowerCase();
  let searchFrom = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  let matched = 0;

  for (const word of anchorWords) {
    const idx = phraseLower.indexOf(word, searchFrom);
    if (idx !== -1) {
      if (firstIdx === -1) firstIdx = idx;
      lastIdx = idx + word.length;
      searchFrom = idx; // allow overlap; advance from match start
      matched++;
    }
  }

  if (matched / anchorWords.length < 0.6 || firstIdx === -1) return null;
  return { start: firstIdx, end: lastIdx };
}

/**
 * Renders fullPhrase with optional anchorText highlighted using the same
 * amber highlight style used in the API-side proof images.
 * Only highlights when fullPhrase has enough additional context beyond anchorText.
 * When isMiss is true, renders the phrase without highlighting (since the text wasn't found).
 *
 * Falls back to word-span fuzzy matching when the PDF text has extra inline
 * elements (e.g. section references) that break exact substring matching.
 */
export function HighlightedPhrase({
  fullPhrase,
  anchorText,
  isMiss,
}: {
  fullPhrase: string;
  anchorText?: string;
  isMiss?: boolean;
}) {
  // Don't highlight when citation is "not found" - misleading to highlight text that wasn't found
  if (isMiss) {
    return <span className="text-dc-destructive">{fullPhrase}</span>;
  }

  if (!anchorText || !shouldHighlightAnchorText(anchorText, fullPhrase)) {
    return <span className="text-dc-muted-foreground">{fullPhrase}</span>;
  }

  // Prefer exact match; fall back to case-insensitive; then fuzzy word-span.
  let start = fullPhrase.indexOf(anchorText);
  let end = start !== -1 ? start + anchorText.length : -1;

  if (start === -1) {
    const phraseLower = fullPhrase.toLowerCase();
    const anchorLower = anchorText.toLowerCase();
    start = phraseLower.indexOf(anchorLower);
    end = start !== -1 ? start + anchorLower.length : -1;
  }

  if (start === -1) {
    // Fuzzy: find the word-span within the phrase that covers the anchor text.
    // This handles PDF text with inserted citations like "(§6.1)" breaking exact match.
    const range = fuzzyAnchorRange(fullPhrase, anchorText);
    if (range) {
      start = range.start;
      end = range.end;
    }
  }

  if (start === -1) {
    return <span className="text-dc-muted-foreground">{fullPhrase}</span>;
  }

  return (
    <span className="text-dc-muted-foreground">
      {fullPhrase.slice(0, start)}
      <span style={ANCHOR_HIGHLIGHT_STYLE} className="text-dc-foreground">
        {fullPhrase.slice(start, end)}
      </span>
      {fullPhrase.slice(end)}
    </span>
  );
}
