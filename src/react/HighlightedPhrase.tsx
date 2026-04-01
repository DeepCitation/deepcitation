import { shouldHighlightAnchorText } from "../drawing/citationDrawing.js";
import { trimPhraseToAnchorWindow } from "../utils/textCleanup.js";
import { fuzzyAnchorRange } from "../utils/fuzzyAnchor.js";
import { ANCHOR_HIGHLIGHT_STYLE } from "./constants.js";

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
    const { text: missDisplay, prefixTrimmed: mp, suffixTrimmed: ms } = trimPhraseToAnchorWindow(fullPhrase, anchorText);
    return (
      <span className="text-dc-destructive">
        {mp && "..."}
        {missDisplay}
        {ms && "..."}
      </span>
    );
  }

  if (!anchorText || !shouldHighlightAnchorText(anchorText, fullPhrase)) {
    const { text: plainDisplay, prefixTrimmed: pp, suffixTrimmed: ps } = trimPhraseToAnchorWindow(fullPhrase, anchorText);
    return (
      <span className="text-dc-muted-foreground">
        {pp && "..."}
        {plainDisplay}
        {ps && "..."}
      </span>
    );
  }

  // Trim fullPhrase to a context window around anchorText to avoid rendering giant page dumps.
  const { text: displayPhrase, prefixTrimmed, suffixTrimmed } = trimPhraseToAnchorWindow(fullPhrase, anchorText);

  // Prefer exact match; fall back to case-insensitive; then fuzzy word-span.
  let start = displayPhrase.indexOf(anchorText);
  let end = start !== -1 ? start + anchorText.length : -1;

  if (start === -1) {
    const phraseLower = displayPhrase.toLowerCase();
    const anchorLower = anchorText.toLowerCase();
    start = phraseLower.indexOf(anchorLower);
    end = start !== -1 ? start + anchorLower.length : -1;
  }

  if (start === -1) {
    // Fuzzy: find the word-span within the phrase that covers the anchor text.
    // This handles PDF text with inserted citations like "(§6.1)" breaking exact match.
    const range = fuzzyAnchorRange(displayPhrase, anchorText);
    if (range) {
      start = range.start;
      end = range.end;
    }
  }

  if (start === -1) {
    return <span className="text-dc-muted-foreground">{displayPhrase}</span>;
  }

  // No surrounding context to anchor the highlight — rendering it would be misleading.
  if (start === 0 && end === displayPhrase.length) {
    return <span className="text-dc-muted-foreground">{displayPhrase}</span>;
  }

  return (
    <span className="text-dc-muted-foreground">
      {prefixTrimmed && "..."}
      {displayPhrase.slice(0, start)}
      <span style={ANCHOR_HIGHLIGHT_STYLE} className="text-dc-foreground">
        {displayPhrase.slice(start, end)}
      </span>
      {displayPhrase.slice(end)}
      {suffixTrimmed && "..."}
    </span>
  );
}
