# Plan: Citation Drawer & Popover UX — Design from User Intent

## Why Do Users Open Citations?

Users interact with citations through a **trust-building funnel**. Each layer answers a progressively deeper question. The UI should match the cognitive load at each stage — not force users to decode ambiguous icons or wade through padding to get the answer they need.

### The Trust Funnel (progressive disclosure)

| Layer | User Question | What They Need | Current Problem |
|-------|--------------|----------------|-----------------|
| **L0: Glance** | "Can I trust this output?" | Instant pass/fail signal across ALL citations | The collapsed trigger shows a single amber ⚠️ that dominates — user can't distinguish "1 miss in 5" from "all bad". The "J" favicon-fallback circle is noise. Text restates what icons should already show. |
| **L1: Scan** | "Which specific claims failed?" | Scan the list, immediately spot the red ones | Drawer items look identical regardless of status. Misses have the same visual weight as verified items. The expand/collapse toggle is a speed bump before you can even scan. |
| **L2: Inspect** | "What exactly failed and why?" | See the claim text, the proof image, which page | Popover has too much header chrome (double-header), inconsistent page format ("PAGE 5" vs "p.4"), and the miss popover shows a wall of text instead of leading with the key info. |
| **L3: Audit** | "How thorough was the search?" | Search attempts, methods tried, pages scanned | This layer works fine today. The VerificationLog is well-designed. |

**Key insight**: Most users only need L0-L1. Power users occasionally need L2. Almost nobody needs L3 unless they're debugging. The current UI front-loads L3-level complexity into L0-L1, increasing cognitive load for everyone.

---

## Design Principles (derived from the funnel)

1. **Status should be self-evident from color alone** — green = good, red = bad, amber = partial, gray = pending. No icon decoding needed. No text needed at L0.
2. **Misses must visually "pop" without reading** — a miss in a list of verified items should be findable in under 1 second by visual scanning, not by reading status labels.
3. **Remove anything that doesn't answer the user's current question** — if you're at L1 (scanning the list), you shouldn't need to click "expand" before you can see the list.
4. **Each layer should have one obvious "go deeper" action** — trigger click → drawer, drawer item click → popover/evidence, popover click → full-size image + audit log.
5. **Consistent vocabulary** — same format for page references everywhere. No uppercase "PAGE 5" in one place and "p.5" in another.

---

## Specific Changes

### A. Trigger Bar (L0: "Can I trust this output?")

**Current**: `⚠️ 5 sources · 4 verified, 1 not found  [J]  >`

The user's L0 question is: "Is everything green?" The current UI fails this because:
- One amber ⚠️ icon is shown (per-group "worst status"), not per-citation — so 1 miss in 5 looks identical to 5 misses in 5
- The text "4 verified, 1 not found" is the *only* way to understand the breakdown — the icons don't communicate it
- The "J" circle (first-letter fallback when no favicon) adds visual noise with zero information

**Target**: `✅✅✅✅❌  5 sources  [favicons]  >`

Changes in `CitationDrawerTrigger.tsx`:
1. **Flatten to per-citation icons**: Instead of one `StatusIconChip` per `SourceCitationGroup` (using worst-status aggregation), render one chip per citation item. Each chip shows that individual citation's verification status icon (check/X/spinner) with status-colored background.
2. **Remove letter-circle fallback from status icons**: Status chips are purely status indicators — they should NEVER show source initials. The "J" problem disappears entirely. (Favicons are already shown separately on the right side of the trigger bar.)
3. **Simplify label**: Change `generateDefaultLabel()` from `"5 sources · 4 verified, 1 not found"` to just `"5 sources"`. The per-citation icons already communicate the breakdown — the text is redundant. The detailed breakdown is available on hover (existing tooltip) and in the drawer (L1).
4. **Fix not_found color/icon**: In `getStatusInfo()` (CitationDrawer.utils.tsx), change not_found from amber `WarningIcon` to red `XCircleIcon`. This is the single highest-impact change — it cascades to every place status is displayed (trigger chips, drawer items, trigger tooltips).

**Files**: `src/react/CitationDrawerTrigger.tsx`, `src/react/CitationDrawer.utils.tsx`

### B. Drawer Content (L1: "Which specific claims failed?")

**Current**: User opens drawer → sees grouped citations with collapse toggles → each item has a small 12px status icon that's hard to distinguish → misses look the same as verified items at a glance → there's a "Show more" button hiding some items.

The user's L1 question is: "Let me scan for red." The current UI fails this because:
- The expand/collapse per-group and "Show more" buttons are speed bumps before the user can even scan
- Miss items have identical visual weight to verified items — same background, same padding, same favicon circle
- The only distinguishing feature is a tiny 12px icon that requires focused reading

**Target**: Flat scrollable list, misses instantly pop with red accent.

Changes in `CitationDrawer.tsx`:
1. **Remove all expand/collapse**: Delete `collapsedGroups` state and `toggleGroup`. Groups are always expanded. Delete `showMore`/`maxVisibleItems` logic — always show all items. The drawer's `overflow-y-auto` already handles scrolling. Keep the `showMoreSection`/`maxVisibleItems` props as accepted-but-ignored for backwards compat.
2. **Red accent for misses**: When `verification?.status === "not_found"`, add `border-l-2 border-red-400 dark:border-red-500` and change hover to `hover:bg-red-50 dark:hover:bg-red-900/10`. This gives misses an instantly-scannable red "gutter" stripe — the user can spot them by color alone without reading any text.
3. **Reduce top padding**: Handle bar `pt-3 pb-1` → `pt-2 pb-0.5`. Header `py-3` → `py-2`. This saves ~16px of dead space that pushes actual content down.
4. **Proof image as "go deeper" affordance**: The proof thumbnail already exists and already calls `onClick`. Make it more discoverable: add a hover overlay with a small zoom icon (like the popover's `AnchorTextFocusedImage` does). This creates the L1→L2 bridge: "I see this claim is verified, let me see the proof."

**Files**: `src/react/CitationDrawer.tsx`, `src/react/CitationDrawer.types.ts`

### C. Citation Popover (L2: "What exactly failed and why?")

**Current**: User clicks an inline citation → popover shows `SourceContextHeader` (document icon + filename + "PAGE 5") → `StatusHeader` (status icon + anchor text + copy button + page badge) → image → verification log. Two headers that both show page number. Tall header area.

The user's L2 question is: "Show me the evidence and tell me what happened."

**Target**: Single compact header, evidence front and center.

Changes in `VerificationLog.tsx` and `CitationComponent.tsx`:
1. **Unify page format to "p.N"**: Change `formatPageLineText()` from `"Page ${pageNumber}"` to `"p.${pageNumber}"`. Change `PageBadge` similarly. The drawer already uses "p.4" — the popover should match. This also saves horizontal space in the header.
2. **Reduce header padding**: `SourceContextHeader` py-2 → py-1.5. `StatusHeader` py-2.5 → py-2. These two components stack vertically — together they currently consume ~36px of header. Reducing saves ~8px, which on a 384px-wide popover is meaningful.
3. **Tighten loading state**: `DefaultPopoverContent` loading state padding p-3 → p-2. The loading spinner + "Searching..." text doesn't need generous whitespace.

**Files**: `src/react/VerificationLog.tsx`, `src/react/CitationComponent.tsx`

### D. Snapshot Updates

All playwright visual snapshots will break since we're changing:
- Trigger bar layout (per-citation icons instead of per-group)
- Drawer item styling (red accents on misses)
- Popover header formatting ("p.N" instead of "PAGE N")
- Padding throughout

Run tests, update baselines, verify the new renders look correct.

**Files**: `tests/playwright/specs/__snapshots__/**`

---

## Implementation Order

| Step | What | Why this order |
|------|------|----------------|
| 1 | Fix `getStatusInfo()` not_found → red XCircleIcon | Foundational — cascades everywhere. Zero risk of breaking anything since it's purely visual. |
| 2 | Trigger: per-citation icons + simplified label | The L0 fix. Highest user impact — every user sees the trigger. |
| 3 | Drawer: remove expand/collapse + red miss accents | The L1 fix. Second-highest impact — users who open the drawer need to scan fast. |
| 4 | Drawer: proof image hover affordance | The L1→L2 bridge. Makes the "go deeper" path discoverable. |
| 5 | Popover: "p.N" format + padding reduction | The L2 fix. Lower impact since fewer users reach this layer, but consistency matters. |
| 6 | Update snapshots | Must be last since every prior step changes visuals. |

---

## Files Changed

| File | Changes |
|------|---------|
| `src/react/CitationDrawer.utils.tsx` | `getStatusInfo()`: not_found icon amber→red, WarningIcon→XCircleIcon |
| `src/react/CitationDrawerTrigger.tsx` | Flatten to per-citation icons, remove letter fallback, simplify label |
| `src/react/CitationDrawer.tsx` | Remove expand/collapse, red miss accents, reduce padding, proof hover |
| `src/react/CitationDrawer.types.ts` | Deprecate `showMoreSection`/`maxVisibleItems` |
| `src/react/VerificationLog.tsx` | `formatPageLineText` → "p.N", `PageBadge` → "p.N", reduce header padding |
| `src/react/CitationComponent.tsx` | Reduce popover padding |
| `tests/playwright/specs/__snapshots__/**` | Updated baselines |

## What We're NOT Changing

- The L3 audit layer (VerificationLog/SearchAttemptRow) — it already works well
- The Radix Popover positioning/portal logic — solid
- The `AnchorTextFocusedImage` component layout — the zoom UX is good
- The `behaviorConfig`/`eventHandlers` API — no behavioral changes
- Any data types or API shapes — purely visual/layout changes
