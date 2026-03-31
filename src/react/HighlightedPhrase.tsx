import { shouldHighlightAnchorText } from "../drawing/citationDrawing.js";
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

  // No surrounding context to anchor the highlight — rendering it would be misleading.
  if (start === 0 && end === fullPhrase.length) {
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
