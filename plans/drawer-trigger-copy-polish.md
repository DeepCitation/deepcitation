# Drawer, Trigger & Copy Polish

Remaining P2/P3 items from `DESIGN_FEEDBACK.md`. Most drawer tasks have been completed.

---

## Done

- [x] **#8** Remove source name repetition from drawer citation rows — `hideSourceName` prop wired up
- [x] **#10** Merge anchor text and fullPhrase in drawer items — `renderPhraseWithHighlight()` wired into `CitationDrawerItemComponent`
- [x] **#11** Collapse single-citation groups into one compact row — `CompactSingleCitationRow` component added
- [x] **#15** Remove right-side favicon letter badges from collapsed trigger — not present in current code (already clean)

---

## Remaining

### Copy button on fullPhrase quote area (#18)

**File:** `src/react/CitationComponent.tsx`

**Problem:** The copy button was removed from the StatusHeader (anchor text echo is gone). Users who want to Ctrl+F a phrase in their own document need a way to copy the `fullPhrase`.

**Change:**
- Add a copy button to the `HighlightedPhrase` display area (added in this PR)
- Hidden by default, shown on hover of the quote area
- Copies `fullPhrase` (not anchor text) — this is what users need for search
- Tooltip: "Copy source quote"

**Acceptance:** Hovering the fullPhrase quote shows a copy button. Clicking it copies the full phrase to clipboard with "Copied!" feedback.
