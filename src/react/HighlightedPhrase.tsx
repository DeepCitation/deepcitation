import { shouldHighlightAnchorText } from "../drawing/citationDrawing.js";
import { ANCHOR_HIGHLIGHT_STYLE } from "./constants.js";

/**
 * Renders fullPhrase with optional anchorText highlighted using the same
 * amber highlight style used in the API-side proof images.
 * Only highlights when fullPhrase has enough additional context beyond anchorText.
 * When isMiss is true, renders the phrase without highlighting (since the text wasn't found).
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
    return <span className="text-red-400 dark:text-red-400/70">{fullPhrase}</span>;
  }
  if (!anchorText || !fullPhrase.includes(anchorText)) {
    return <span className="text-gray-600 dark:text-gray-300">{fullPhrase}</span>;
  }
  if (!shouldHighlightAnchorText(anchorText, fullPhrase)) {
    return <span className="text-gray-600 dark:text-gray-300">{fullPhrase}</span>;
  }
  const idx = fullPhrase.indexOf(anchorText);
  return (
    <span className="text-gray-600 dark:text-gray-300">
      {fullPhrase.slice(0, idx)}
      <span style={ANCHOR_HIGHLIGHT_STYLE}>{anchorText}</span>
      {fullPhrase.slice(idx + anchorText.length)}
    </span>
  );
}
