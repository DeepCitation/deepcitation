# concepts.md

## Purpose

Every field, UI element, and concept in the DeepCitation system has exactly one canonical name. Names are organized so two things are obvious at a glance: **which document the data came from**, and **which role it plays in the scanning UX**. When both are clear from the name alone, engineers can reason about the code without re-deriving the data model, and designers can reason about the UI without re-deriving the interaction model.

## Core principle: scanning, not reading

Users do not read citations — they scan them. Every view state must support two modes: *first glance* (when attention arrives) and *reset* (when attention drifts and returns). Each state designates one **scan anchor** whose job is to reacquire attention on reset. The anchors form a progression from abstract to concrete: a verification badge → a cropped render of the actual source → a full-page render with attention directed by spotlight and brackets. The lexicon below exists to keep this progression legible — every name ties back to its role in the scan.

The single comparison the user ever has to make is: **does the claim faithfully represent the source?** Every visible element is either one side of that comparison, the context around it, or a visual treatment that supports it.

## Domain binding rule

Every field holding data belongs to exactly one of two documents:

- **Domain A — the asserting document.** The AI report, email, blog draft, or social post being verified. The thing making claims.
- **Domain B — the authoritative document.** The PDF, article, statute, or dataset doing the verifying. The thing claims are checked against.

Field names must make their domain unambiguous at a glance:

- `claim*` names Domain A data only.
- `source*` names Domain B text.
- `evidence*` names Domain B visuals (pixels rendered from the source).
- Fields describing the *relationship* between the two domains (variance, verification status) belong to a third category and are named for the comparison itself, not for either document.

Domain A has a text tier only. Domain B has both a text tier (`source*`) and a visual tier (`evidence*`).

## Text tier

### `claimText` — Domain A
The specific phrase in the asserting document that the user can click to verify. This is the scan target the user will later hunt for in the source. Rendered inline with a `verificationBadge`.

### `sourceMatch` — Domain B
The exact verification text located in the authoritative document. In the happy path, `sourceMatch === claimText` character-for-character. When they diverge, the variance UI makes the divergence explicit.

**Substring collapse rule.** If `sourceMatch` is a substring of `claimText` or vice versa, set both equal to the longer of the two. This eliminates the "deduct" vs. "generally deduct only 50% of the cost of furnishing" bug class — the scanner always sees the claim exactly as it appears in the match.

### `sourceContext` — Domain B
The surrounding prose in the authoritative document, containing `sourceMatch`. Rendered in the focus popover as a quoted snippet with `sourceMatch` highlighted, and in page view as the region framed by `contextBrackets` and lit by the `spotlight`.

## Visual tier (Domain B only)

### `evidenceKeyhole` (short: `keyhole`)
A cropped visual render of the source document, pre-zoomed to the most readable region around `sourceMatch`. The keyhole is the scan anchor of the focus popover — its entire job is to let the user confirm "yes, this is really in the source" in under a second. Two display modes:
- **`keyholeCropped`** — default, shows the `keyholeViewport` around `sourceMatch`.
- **`keyholeExpanded`** — full evidence image, pan and zoom enabled.

Use the short form `keyhole` in code where context is unambiguous; use `evidenceKeyhole` in the schema and docs.

### `keyholeViewport`
The rectangle in source-page coordinates currently shown by the keyhole. Panning translates the viewport, expanding scales it, transitioning to `pageView` grows it until it contains `sourceContext` and then the whole page. Every keyhole interaction is a transformation on this one named rectangle.

### `readableRegion`
The computed rectangle the readability heuristic proposes as the initial `keyholeViewport`. Starts equal to the viewport and diverges as the user interacts. Two names for two genuinely different things: the heuristic's recommendation (`readableRegion`) versus the current display state (`keyholeViewport`).

## Page-view visual treatments (Domain B)

### `spotlight`
The attenuation treatment that dims everything *outside* a padded region containing `sourceContext`, leaving the region lit. The scan anchor of `pageView`. Use the formal name `pageSpotlight` if a second spotlight treatment is ever added at a different scale; `spotlight` alone is the current shorthand.

### `contextBrackets`
The visual brackets framing `sourceContext` inside the lit region. Works with the spotlight to provide layered attention cues — spotlight attenuates the surroundings, brackets frame the target. Named for the data they bind to (`sourceContext`), following the self-documenting binding pattern used throughout the lexicon.

**Nesting in page view:** `sourceMatch` ⊂ `keyhole` ⊂ `sourceContext` ⊂ page.

## Cross-domain comparison

### `isVerbatim`
Boolean. True when `claimText === sourceMatch` character-for-character. Named for the happy path: the positive value is the desired default, and conditionals read naturally (`if (!isVerbatim) showIndicator()`).

### `varianceIndicator`
The UI element shown when `isVerbatim` is false. Polarity is intentionally asymmetric: the boolean is named for the happy state, the UI element is named for the exceptional state it signals. Typical variance cases: "FREE" vs. "$0.00", "roughly half" vs. "50%", paraphrases, unit conversions.

### `varianceFootnote`
The reconciliation line in the focus popover, shown only when `isVerbatim` is false, reading "Shown in report as: [claimText]" so the user can see both strings explicitly. `varianceIndicator` is the badge; `varianceFootnote` is the explanation — together they form the complete variance UI.

### `verificationBadge`
The inline icon next to `claimText` in preview. A container with states: `verified`, `unverified`, `variance`, `pending`. The "variance indicator" in preview is the badge in its `variance` state — one element, multiple states, single name.

### Page variance
When the claim cites one page but `sourceMatch` is located on a different page:
- **`claimedPage`** — the page number the asserting document cites.
- **`sourcePage`** — the page number where `sourceMatch` was actually found.
- **`isPageVerbatim`** — boolean, true when `claimedPage === sourcePage`.

Surfaced in the `pageNavigator` when false.

## View states

Three states, each with a designated scan anchor.

### 1. `preview`
The raw HTML or markdown of the asserting document with `claimText` rendered inline and a `verificationBadge` next to it. **Scan anchor:** the verification badge.

### 2. `focusPopover`
The citation popover triggered by interacting with `claimText`. Contains:

- **a.** Header with file info, verification status, and the `pageNavigator` (top-right).
- **b.** `sourceContext` quoted with `sourceMatch` highlighted. A `varianceIndicator` appears if `isVerbatim` is false, with a `varianceFootnote` reconciling the two strings.
- **c.** The `evidenceKeyhole` in `keyholeCropped` mode, showing the rendered source around `sourceMatch`. Clicking expands to `keyholeExpanded`.
- **d.** A `pageLink` ("View page") and the header `pageNavigator` both transition to `pageView`.

**Scan anchor:** the `keyholeViewport` — the most readable region of the actual rendered source.

### 3. `pageView`
The full source page rendered with a `spotlight` dimming everything outside a padded region containing `sourceContext`. Within the lit region, `contextBrackets` frame `sourceContext` and the keyhole remains the most readable sub-region, with `sourceMatch` highlighted inside it. Scannability on the keyhole is preserved across the transition from focus popover.

**Scan anchor:** the `spotlight`.

## Navigation affordances

### `pageNavigator` (short: `pagePill`)
The primary navigation control in the `focusPopover` header, top-right. Transitions to `pageView` while keeping focus on the keyhole. Contains a `pagePicker` for multi-page cases.

### `pagePicker`
A social-media-inspired control inside the `pageNavigator` allowing page-by-page navigation. Descriptive for the active and adjacent pages, non-descriptive for distant pages.

### `pageDots`
The non-descriptive indicators in the `pagePicker` representing distant pages.

### `pageLink`
The secondary, low-emphasis text affordance ("View page") at the bottom of the `focusPopover`. Same destination as `pageNavigator`, different visual weight and scan position.

## Invariants

1. **Domain binding.** Every field is named for exactly one domain or explicitly for the cross-domain comparison. No field name mixes `claim*` with Domain B data or `source*`/`evidence*` with Domain A data.
2. **Happy path verbatim.** When `isVerbatim` is true, `claimText === sourceMatch` holds character-for-character. The UI is allowed to assume this.
3. **Substring collapse.** If `sourceMatch ⊆ claimText` or `claimText ⊆ sourceMatch`, both are set to the longer string before display.
4. **Containment in page view.** `sourceMatch ⊂ keyhole ⊂ sourceContext ⊂ page`. Every visual layer strictly contains the next.
5. **One scan anchor per state.** Each view state designates exactly one element responsible for reacquiring attention on reset. Anchors progress from abstract (badge) to concrete (spotlight on real pixels).
6. **UI copy is local; field names are global.** Field names follow data lineage and domain binding. User-facing copy can reframe the same data in user-mental-model terms without renaming the underlying field.

## Rename history

For codebase migration reference:

| Old name | New name | Reason |
|---|---|---|
| `claimText` | `claimText` | Names role and domain (Domain A, the claim being verified) instead of presentation layer |
| `sourceMatch` | `sourceMatch` | Names domain (B) and role (located match), removes "anchor" overload |
| `sourceContext` | `sourceContext` | Domain binding — the prose is in Domain B, not Domain A, so `claimContext` would mislead developers into querying the wrong document |