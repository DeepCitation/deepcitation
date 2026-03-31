/**
 * Find start/end indices in `text` that best cover `anchor` using word matching.
 * Returns null if fewer than 60% of anchor words (length ≥ 2) are found in order.
 *
 * Handles cases like anchor="retrieval failure and generation bottleneck" inside
 * text="retrieval failure (§6.1) and generation bottleneck (§6.2)" where the
 * source has inserted inline characters that break exact substring matching.
 */
export function fuzzyAnchorRange(text: string, anchor: string): { start: number; end: number } | null {
  const anchorWords = anchor
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ""))
    .filter(w => w.length >= 2);
  if (anchorWords.length === 0) return null;

  const textLower = text.toLowerCase();
  let searchFrom = 0;
  let firstIdx = -1;
  let lastIdx = -1;
  let matched = 0;

  for (const word of anchorWords) {
    const idx = textLower.indexOf(word, searchFrom);
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
