# Citation Component UX Feedback — Actionable Items

Organized by priority. Each item includes current behavior, what to change, and implementation notes.

---

## P0 — Source Identity

### 1. Always show source name in popover header

**Current:** Document popover SourceContextHeader shows a generic document icon + "P.5". No filename, no label. The user has zero indication of *which source* the citation came from.

**Change:** Always render the source name in the header:
- Use `sourceLabel` if provided (user's renamed display name)
- Fall back to `verification.label` (original filename from upload)
- Fall back to `citation.title` (for URL citations)
- Last resort: show "Document" or the domain

**Target layout (document):**
```
📄 Q4 Financial Report                    p.5
```

**Target layout (URL):**
```
🌐 Build muscular arms with kettlebell moves   fitandwell.com ↗
```

For URL citations, prefer `citation.title` or `citation.siteName` over raw domain when available. The domain alone ("fitandwell.com") is much less useful than the article title.

**Files:** `VerificationLog.tsx` (SourceContextHeader), `CitationComponent.tsx` (prop threading)

---

### 2. Thread `sourceLabel` into CitationDrawer

**Current:** CitationDrawer does not receive `sourceLabel`. Group headers and citation rows fall back to `verification.label` (original upload name) or `citation.siteName`/`citation.domain`. If a user renamed "doc_abc123.pdf" to "Board Meeting Notes" in their app, the drawer still shows the cryptic original.

**Change:** Accept `sourceLabel` (or a `sourceLabelMap: Record<attachmentId, string>`) on `CitationDrawer` and `CitationDrawerTrigger`. Use it in:
- `SourceGroupHeader` source name display
- `CitationDrawerItemComponent` source name line
- Right-side favicon letter badges (use first letter of sourceLabel if available)

**Files:** `CitationDrawer.tsx` (props, SourceGroupHeader, CitationDrawerItemComponent)

---

## P1 — Popover Information Hierarchy

### 3. Show `fullPhrase` with highlighted `anchorText` instead of echoing anchor text

**Current:** Verified popover status row shows: `✓ | "Functional status" | 📋`. The anchor text is the text the user already clicked on — it's a mirror, not information. The `fullPhrase` (the actual source context) is absent from the popover.

**Change:** Replace the quoted anchor text with the `fullPhrase`, highlighting the `anchorText` substring within it using the same amber highlight style used in the API-side proof images.

**Target rendering:**
```
✓ Verified in Q4 Financial Report
  "The patient's [Functional status] improved significantly
   over the 6-week period, exceeding baseline measures."
```

Where `[Functional status]` is rendered with a highlight background, not literal brackets.

**Highlight style — share constants with API-side `citationDrawing.ts`:**

Move these constants into the SDK so the client-side highlight matches the visual proof image:
```typescript
// New file: src/constants/proofStyles.ts (or add to existing constants)
export const ANCHOR_HIGHLIGHT_COLOR = "rgba(251, 191, 36, 0.2)";       // amber at 20%
export const ANCHOR_HIGHLIGHT_COLOR_DARK = "rgba(251, 191, 36, 0.25)"; // slightly more visible in dark
export const SIGNAL_BLUE = "#005595";
export const SIGNAL_BLUE_DARK = "#77bff6";
```

Then expose as CSS custom properties for consumers to override:
```css
--dc-anchor-highlight: rgba(251, 191, 36, 0.2);
--dc-anchor-highlight-dark: rgba(251, 191, 36, 0.25);
```

Apply as background on the `anchorText` substring within `fullPhrase`:
```tsx
<span style={{ backgroundColor: "var(--dc-anchor-highlight)" }}>
  {anchorText}
</span>
```

Only show the highlight when `fullPhrase` has at least 2 more words than `anchorText` (matching the existing `MIN_WORD_DIFFERENCE` constant from `citationDrawing.ts`). When they're identical or near-identical, just show the text without highlight.

**Files:** New `src/constants/proofStyles.ts`, `VerificationLog.tsx` (StatusHeader / SourceContextHeader), `CitationComponent.tsx` (popover content)

---

### 4. Partial match: surface what was found vs. expected

**Current:** Shows "Partial match" + "Only part of 'Functional status' was found." Vague — doesn't say *which* part.

**Change:** Use `verification.verifiedMatchSnippet` or the successful `searchAttempt.matchedText` to show the actual matched text alongside the expected text. The proof image often makes this visually clear, but the text should reinforce it — especially when the image is zoomed out and hard to read, or when there's no image.

**Target rendering (with image available):**
```
⚠ Partial match in Q4 Financial Report               p.5
  Found "Functional" — expected "Functional status"
  [proof image]
```

**Target rendering (no image):**
```
⚠ Partial match in Q4 Financial Report               p.5
  Found: "Functional"
  Expected: "Functional status"
```

**Data source:** `searchAttempts[].matchedText` for the successful attempt, or `verification.verifiedAnchorText` / `verification.verifiedMatchSnippet`.

**Files:** `VerificationLog.tsx` (StatusHeader, humanizing message)

---

### 5. Stop repeating anchor text 3x in not-found popover

**Current:** "Functional status" appears as: (1) inline text the user clicked, (2) status row quoted text, (3) humanizing message: `We couldn't find "Functional status" in this document.`

**Change:** Since item #1 puts the source name in the header and item #3 rewrites the status row, the status row becomes:
```
✕ Not found in Q4 Financial Report                   p.5
  We couldn't find this phrase in the document.
```

The message no longer needs to name the phrase because the user just clicked on it. If you want to keep the phrase for context (e.g., if the popover could be opened programmatically), show it once in the humanizing message only, not in the status row.

**Files:** `VerificationLog.tsx` (StatusHeader display text, humanizing messages)

---

### 6. Rewrite status row to use source name, not anchor text

**Current status row by state:**
| State | Current | Proposed |
|-------|---------|----------|
| Verified | `✓ "Functional status" 📋` | `✓ Verified in Q4 Financial Report` |
| Partial (other page) | `⚠ Found on different page` | `⚠ Found on p.7 in Q4 Financial Report` (expected p.5) |
| Partial (text) | `⚠ Partial match` | `⚠ Partial match in Q4 Financial Report` |
| Not found | `✕ "Functional status" 📋` | `✕ Not found in Q4 Financial Report` |
| Pending | `◌ Searching...` | `◌ Searching Q4 Financial Report...` |

The headline should do heavy lifting. Most users won't drill into details — the status row is the only line they read. It should answer two questions instantly: *what happened* and *where*.

**Files:** `VerificationLog.tsx` (StatusHeader)

---

### 7. Collapse verification log into human summary; hide raw search details

**Current:** Expanded log shows numbered rows with internal method names:
```
1. ✓ "Revenue increased..."   Exact location · Page 5
2. ✓ "Revenue..."             Nearby lines · Page 5
3. ✗ "Revenue..."             Extended nearby lines · Page 5
...
8. ✗ "Revenue..."             Entire document
```

**Change:** Replace with a single human-readable summary. The data needed is already available in `searchAttempts[]`:

**For not-found (build from `searchAttempts` array):**
```
Searched N variations across pages X-Y. No match found.
```

Computed from:
- `N` = `searchAttempts.length`
- Page range = `new Set(searchAttempts.map(a => a.pageSearched).filter(Boolean))` → min-max
- Include `searchAttempts.filter(a => a.searchScope === "document").length > 0` → append "including full document scan"

**For not-found with closest match** (when any attempt has `matchedText` but was ultimately rejected):
```
Searched 8 variations across pages 3-7. No exact match.
Closest: "Revenue increased by 14%" on page 6
```

Computed from: Find the `searchAttempt` where `success === false` but `matchedText` exists, or use `verification.verifiedMatchSnippet` if the overall status is not_found but a partial was found and rejected.

**For found/partial (keep simple):**
```
▸ How we verified this · Exact match                    2h ago
```
(Already good — no change needed for success states.)

**Detail toggle:** Move the full row-by-row search log behind a "Show search details" link (default collapsed, rendered below the summary). Keep it available for power users and debugging, but don't show it by default.

**Implementation note on green checkmarks in miss logs:** When the overall result is not-found, don't show green checkmarks on intermediate search attempts. Use neutral gray bullets or red X's for all rows. Green checks on a failed verification are confusing.

**Files:** `VerificationLog.tsx` (ExpandedTimeline, summary generation)

---

## P2 — Drawer Redundancy

### 8. Remove source name repetition from citation rows within groups

**Current:** Source name appears 3x per citation: group header shows "React" + letter avatar, citation row shows "React ✓" source label, citation is inside the React group.

**Change:** Remove the source name from `CitationDrawerItemComponent` when it's rendered within a `SourceGroupHeader`. The group establishes source context. Citation rows should show only:
```
✓  split the UI into independent pieces              p.3
```

Not:
```
✓  React ✓
   split the UI into independent pieces
   Components let you split the UI...
```

**Files:** `CitationDrawer.tsx` (CitationDrawerItemComponent)

---

### 9. Hide "1 citation" count on single-item groups

**Current:** Every group header badge shows "1 citation" even when there's exactly one item.

**Change:** Only render the count badge when `citations.length > 1`. Single-item groups don't need a count — it's self-evident.

**Files:** `CitationDrawer.tsx` (SourceGroupHeader)

---

### 10. Merge anchor text and fullPhrase in drawer; highlight anchor within full

**Current:** Drawer citation rows show both:
- **Bold:** "split the UI into independent pieces" (anchor text)
- **Regular:** "Components let you split the UI into independent pieces." (fullPhrase)

When anchor text is a substring of fullPhrase, this reads as a stutter.

**Change:** Show only `fullPhrase` with the `anchorText` portion bolded (or use the same amber highlight from item #3). When they're identical, show once. Same `MIN_WORD_DIFFERENCE` threshold from item #3.

**Files:** `CitationDrawer.tsx` (CitationDrawerItemComponent)

---

### 11. Collapse single-citation groups into one row

**Current:** A source with 1 citation renders as: group header row (with collapse chevron ▼) + citation item row. The chevron implies there's content to collapse, but there's only one item.

**Change:** When a group has exactly 1 citation, merge group header and citation into a single compact row:
```
[R]  React  ✓  split the UI into independent pieces      p.3
```

Keep the two-level layout (collapsible header + items) only when a group has 2+ citations.

**Files:** `CitationDrawer.tsx` (rendering logic in drawer content)

---

## P2 — Proof Image Interaction

### 12. Remove redundant "Expand" text link below proof image

**Current:** The proof image is already wrapped in a `<button>` with `onClick` → `onImageClick()`. Below it, a separate "Expand" `<button>` with a zoom icon does the exact same thing. Two click targets, one action.

**Change:** Remove the "🔍 Expand" text link entirely. The image is already the click target. Add:
- `cursor: zoom-in` on the image button (if not already present)
- On hover: subtle dark overlay with centered magnifier icon (e.g., `bg-black/20` overlay with a `ZoomInIcon` centered, appearing on hover)
- `aria-label="Click to view full size"` is already present — good

If an accessible text fallback is needed for screen readers beyond the aria-label, use visually-hidden text inside the button rather than a visible link.

**Files:** `CitationComponent.tsx` (image rendering section, remove Expand button)

---

## P2 — Trigger Bar

### 13. Add interactive affordance to trigger bar

**Current:** Stacked colored dots/checkmarks + "N sources" text. Looks like a passive status badge, not a clickable element. No visual change on hover.

**Change:** Add hover state: `hover:bg-gray-50 dark:hover:bg-gray-800` background + `cursor: pointer`. Consider a subtle right chevron `›` at the end to signal "click for more." The hover background makes it feel tappable/clickable.

**Files:** `CitationDrawer.tsx` (CitationDrawerTrigger)

---

### 14. Fix "1 sources" → "1 source" (singular/plural)

**Current:** Single-source trigger reads "1 sources".

**Change:** `n === 1 ? "1 source" : \`${n} sources\``. Audit "citation"/"citations" too.

**Files:** `CitationDrawer.tsx` (CitationDrawerTrigger label)

---

### 15. Drop right-side favicon letter badges from collapsed trigger

**Current:** Tiny colored circles with single letters (R, T, N, T, V) on the right side. Unreadable at that size, meaningless without labels.

**Change:** Remove from collapsed state. Show them only in the expanded drawer where they have room to breathe and appear alongside source names. The left-side status icons (checkmarks/spinners) already communicate the important information (verification status breakdown).

Alternatively, show them only during the hover-spread animation where there's enough space for a tooltip per icon.

**Files:** `CitationDrawer.tsx` (CitationDrawerTrigger right-side badges)

---

### 16. Mobile: skip hover-spread, go straight to drawer

**Current:** Hover-to-spread interaction requires a mouse. Mobile users see stacked icons with no way to preview individual source statuses before opening the drawer.

**Change:** On touch devices, tap the trigger to open the drawer directly (skip spread animation). Optionally, show a compact summary text on the trigger itself for mobile: "2 verified, 1 partial" inline, replacing the spread interaction.

**Files:** `CitationDrawer.tsx` (CitationDrawerTrigger touch handling)

---

## P2 — Chip Variant Polish

### 17. Increase chip visual presence and hover contrast

**Current chip hover:** `hover:brightness-95` — a 5% brightness reduction that is barely perceptible, especially on light gray backgrounds.

**Change:**
- **Default state:** Bump the background from `bg-gray-100` to something slightly more present. Chips should "pop" enough to be recognizable as interactive elements distinct from surrounding text.
- **Hover state:** Replace `hover:brightness-95` with an explicit higher-contrast background:
  - Verified: `hover:bg-green-200 dark:hover:bg-green-800/40`
  - Partial: `hover:bg-amber-200 dark:hover:bg-amber-800/40`
  - Not found: `hover:bg-red-200 dark:hover:bg-red-800/40`
  - Pending: `hover:bg-gray-200 dark:hover:bg-gray-700`
- Add `transition-colors duration-150` for smooth hover transition (replace `transition-colors` if already present, just ensure duration is reasonable).

The chip should feel like a button you can press, not a label you can read.

**Files:** `CitationVariants.tsx` (chip variant className, statusClass)

---

## P3 — Copy Button

### 18. Gate copy button behind hover; clarify what's being copied

**Current:** Copy button (clipboard icon) is always visible (opacity-0 → opacity-100 pattern) next to anchor text in the status row. Always copies anchor text.

**Change:** Two options depending on risk tolerance:

**Option A (safer, recommended): Remove from status row, add to fullPhrase quote box.**
- Remove copy from status header entirely
- Add a copy button on the `fullPhrase` quote box (item #3). This is what users actually want to copy — the source context — so they can find it in their own document
- Tooltip: "Copy source quote"

**Option B (keep but improve):**
- Show only on hover of the quote box area
- Change icon to include a text label on hover: `📋 Copy quote` (not just the icon)
- Copy the `fullPhrase`, not the anchor text — the anchor text is too short to be useful as a search string in another document

**Use case context:** The user wants to open their own copy of the document and Ctrl+F to find the passage. The `fullPhrase` is more useful for this than the short `anchorText`.

**Files:** `VerificationLog.tsx` (StatusHeader copy button), `CitationComponent.tsx` (quote box)

---

## P3 — Dark Mode

### 19. Brighten pending indicators in dark mode

**Current:** Gray-400 (`#9ca3af`) spinner/dot on gray-900 background. Perceptually faint for the one state where visibility matters most ("something is happening").

**Change:** Use `text-gray-300 dark:text-gray-300` (bump from 400 to 300 in dark mode only). Or use a pulsing `blue-400` for pending to differentiate it from the static gray of "no data" states.

**Files:** `CitationVariants.tsx`, `CitationComponent.tsx` (pending indicator color classes)

---

## Deferred / Won't Fix

### ~~Status header empty states~~ (Solved by item #6)
Item #6 (rewriting status rows to include source name) eliminates the empty-text problem. "Verified in Q4 Financial Report" is never empty.

### ~~`text` variant near-duplicate of `chip`~~
Keep both. The `text` variant serves a real purpose (inheriting parent typography for seamless inline use). The real issue is that `chip` doesn't pop enough — addressed in item #17.

### ~~Proof image not clickable~~ (Already implemented)
The image IS already wrapped in a `<button>` with click handler. The issue is the redundant "Expand" text link below it — addressed in item #12.
