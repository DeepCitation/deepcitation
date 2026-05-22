# Deep Citation Standards

**Single source of truth for all DeepCitation citation work.**

This document defines the rules that govern how citations are authored, what the verification pipeline must emit, how QA reviewers grade results, and what UX invariants the web surface must satisfy.

The canonical vocabulary — domain binding (`claim*` vs `source*` vs `evidence*`), view states (`preview`, `focusPopover`, `pageView`), and scan anchors — is defined in `packages/deepcitation/docs/agents/deep-citation-concepts.md`. Field names in this document follow that vocabulary: `sourceMatch` is Domain B text (the authoritative document), `claimText` is Domain A text (the asserting document), and `evidenceKeyhole` / `keyholeViewport` are the visual tier of Domain B.

---

## Stable Requirement IDs

Requirement IDs are permanent anchors for reviews, issues, postmortems, and agent self-checks.
Do not reuse an ID for a different rule. If a rule is retired, keep the ID and mark it retired.
Any DeepCitation-related bug report should cite the most specific ID below.

### Compliance Matrix

| ID | Requirement | Severity | Primary check |
|----|-------------|----------|---------------|
| `DC-PRE-001` | Markdown containing citation markers has exactly one parseable `<<<CITATION_DATA>>>` block that is not fenced as visible markdown. | Blocker | `deepcitation lint --strict <file>` |
| `DC-PRE-002` | Citation markers and citation records match one-to-one; no orphan marker, orphan record, duplicate `n`, or detached marker. | Blocker | `deepcitation lint --strict <file>` |
| `DC-AUTH-001` | `sourceMatch` is a short scan anchor: <=4 words and <=40 characters. | High | `deepcitation lint --strict <file>`; Playwright gate 4 |
| `DC-AUTH-002` | `sourceMatch` is a verbatim, contiguous substring of `sourceContext`; no paraphrase and no ellipsis. | High | `deepcitation lint --strict <file>`; verified HTML review |
| `DC-AUTH-003` | Multi-value fields cite one distinctive value, not an entire list. | High | reviewer sample |
| `DC-AUTH-004` | `claimText` is a natural, short Domain A scan target and the marker is adjacent to the intended label. | Medium | `deepcitation lint --strict <file>`; rendered markdown review |
| `DC-DATA-001` | `n`, `p`, and `l` fields are present, well-shaped, and refer to the intended source page and lines. | Blocker | `deepcitation lint --strict <file>`; verified HTML review |
| `DC-DATA-002` | `lineIds` include the anchor line plus nearby context lines; they never default to the page's first line. | High | verified HTML review; screenshot/keyhole review |
| `DC-DATA-003` | `sourceContext` is the substantive evidence passage containing `sourceMatch`, not a header, footer, noise fragment, or unrelated neighboring text. | High | reviewer sample |
| `DC-VERIFY-001` | Verification quality meets target rates: found >80%, partial <15%, not-found <5% for standard domains. | High | verified report metrics |
| `DC-VERIFY-002` | A partial, ambiguous, globally failed, or blocked result is never presented as fully verified. | Blocker | UI/report review; status rendering tests |
| `DC-VERIFY-003` | All status indicators for one citation agree: text underline, dot, badge, icon, tooltip, and detail panel use the same verification state. | Blocker | rendered UI review; status rendering tests |
| `DC-RENDER-001` | Markdown rendering preserves citation markers inline with the intended claim and never exposes raw citation JSON/data blocks to the user. | Blocker | rendered markdown/HTML screenshot; markdown renderer tests |
| `DC-RENDER-002` | Tables, lists, bold labels, and inline links preserve citation placement and do not detach markers from their claims. | High | rendered markdown/HTML screenshot; parser tests |
| `DC-RENDER-003` | Markdown emphasis, heading/list syntax, and citation syntax are fully parsed; raw `*`, `**`, `[N]`, or orphan superscript remnants do not appear in final UI. | High | rendered markdown/HTML screenshot; markdown renderer tests |
| `DC-RENDER-004` | Every rendered citation indicator is interactive and backed by a parsed citation record; no inert superscript numbers or decorative-only markers. | High | rendered UI review; parser tests |
| `DC-UX-001` | The user can reach confidence in under one second: preview -> focusPopover -> pageView keeps a visible scan anchor at every step. | High | Playwright gates 12, 13, 15; screenshot review |
| `DC-UX-002` | The popover quote highlights `sourceMatch` inside `sourceContext`; miss states suppress false highlights. | High | component tests; screenshot review |
| `DC-UX-003` | The evidence keyhole opens readable and centered on the anchor, not on the page's top-left corner or unrelated text. | High | Playwright gate 15; screenshot review |
| `DC-UX-004` | Page-view evidence frames the real source location with spotlight/context brackets and keeps the anchor in focus through expansion. | High | Playwright gates 12, 13; screenshot review |
| `DC-UX-005` | The visible `claimText` itself is the clickable citation trigger; a tiny badge/icon-only hit target is not acceptable. | High | rendered UI review; Playwright hit-target test |
| `DC-UX-006` | Visual connectors, badges, keyholes, brackets, and highlights all point to the same source content as the clicked claim, not an adjacent row/list item. | Blocker | screenshot review; Playwright row/target coherence test |
| `DC-REVIEW-001` | Review reports cite failed requirement IDs, include evidence paths/screenshots, and distinguish blocker/high/medium/low findings. | Medium | human/report review |

### Agent Pre-Submit Rule

Before claiming DeepCitation-related work is done, an agent must:

1. Name the affected IDs from the compliance matrix.
2. Run each listed automated check that applies to the touched artifact.
3. For human-only visual checks, inspect a rendered screenshot or verified HTML and cite the evidence path.
4. If a simple ID fails (`DC-PRE-*`, `DC-AUTH-*`, `DC-DATA-*`, `DC-RENDER-*`), fix it before submitting instead of filing it as a follow-up.
5. If the failure is non-local or blocked, report the failed ID, evidence, and exact blocker.

### Regression Examples Agents Must Catch

Use these as pattern matches during review. If the output resembles one of these, stop and fix
or file the failed ID before saying done.

| Scenario | Failed ID(s) | Auto-realization cue | Required response |
|----------|--------------|----------------------|-------------------|
| A markdown answer shows a visible fenced `<<<CITATION_DATA>>>` block below the user-facing text. | `DC-PRE-001`, `DC-RENDER-001` | The raw JSON/data block is visible in rendered markdown. | Remove the fence/raw display path; run `deepcitation lint --strict`. |
| A citation anchor is `severe chronic pain that prevents the patient from standing`. | `DC-AUTH-001` | `sourceMatch` is longer than 4 words or 40 characters. | Shorten to the distinctive source phrase, then lint. |
| The body says `The [2] diagnosis is severe` instead of `The **diagnosis** [2] is severe`. | `DC-AUTH-004`, `DC-RENDER-002` | Marker appears before or detached from the clickable label. | Move the marker adjacent to the label; inspect rendered markdown. |
| A table cell contains `Amoxicillin 500 mg tid 8 days and Metronidazole 500 mg bid 8 days` as one citation anchor. | `DC-AUTH-003` | One citation tries to prove multiple values. | Split or cite one value; use separate citations for separate facts. |
| A verified report says `DeepCitation Partial Match` but the product summary counts it as green/verified. | `DC-VERIFY-002` | Partial status is treated as fully resolved. | Downgrade the UI/report state; include partial rate in the review. |
| The keyhole screenshot opens on a page header while the highlighted source text is lower on the page. | `DC-DATA-002`, `DC-UX-003` | Evidence image is readable but shows the wrong region. | Check `lineIds` and bounding boxes; do not accept as done. |
| A rendered markdown table loses citation markers or places all markers at the end of the table. | `DC-RENDER-002` | Source claims and markers no longer travel together after render. | Fix renderer/parser behavior and add a table/list regression test. |
| A table row's claim text is visible but only the small citation badge/icon beside it is clickable. | `DC-UX-005`, `DC-RENDER-002` | The user cannot click the words they are trying to verify. | Make the full claim text/badge group one accessible trigger; add a hit-target test. |
| Clicking or hovering `Multiple psychiatrists` points the visual indicator/keyhole at the row below, `DBT at hospital`. | `DC-UX-006`, `DC-DATA-002`, `DC-DATA-003` | The visual evidence target proves a neighboring row, not the clicked claim. | Treat as a false-evidence blocker; fix row/line target mapping before done. |
| A rendered answer still shows raw markdown, such as `*Are documents...** Yes`, instead of styled text. | `DC-RENDER-003` | Markdown syntax is visible to the user. | Fix markdown parsing/render routing before accepting the result. |
| Citation numbers show as tiny superscripts but cannot be opened or mapped to evidence. | `DC-RENDER-004`, `DC-PRE-002` | A citation marker survived as inert decoration. | Reconcile marker parsing with citation records and add an interaction test. |
| A green verified underline is paired with a grey dot, miss dot, or unknown-state badge. | `DC-VERIFY-003`, `DC-VERIFY-002` | One citation presents two conflicting statuses. | Use one canonical status source; add a state-combination regression test. |

---

## §1 Anchor Text Rules (Hard) — `DC-AUTH-001`, `DC-AUTH-002`, `DC-AUTH-003`

These rules are non-negotiable. Any citation that violates them is a bug.

`sourceMatch` is Domain B text — the exact phrase located in the authoritative document. It is the scan anchor of the `focusPopover` (the `keyholeViewport` is pre-centered on it) and must be precise enough for the user to confirm "yes, this is really in the source" in under a second.

- **≤4 words AND ≤40 characters** — hard ceiling on `sourceMatch` length
- **Verbatim, contiguous substring of `sourceContext`** (case-insensitive) — never a paraphrase
- **Never use ellipsis (`...`)** in an anchor — pick the most distinctive contiguous substring instead
- **Never paraphrase** — copy the exact characters from the source
- **For multi-value fields, cite ONE value only** (not the entire list)
  - BAD: `"Tooth Numbers 3 9 14 19 24 30"`
  - GOOD: `"Tooth Numbers"`
  - BAD: `"Amoxicillin 500 mg tid 8 days and Metronidazole 500 mg bid 8 days"`
  - GOOD: `"Amoxicillin 500 mg"`

---

## §2 Truncation Strategy

When the evidence `sourceContext` is longer than 4 words, truncate to the most distinctive core. The goal is a substring a reader could uniquely ctrl+F.

- **Drop leading quantifiers**: `"six ground floor commercial units"` → `ground floor commercial`
- **Drop size modifiers**: `"fifty-nine interior underground parking units"` → `underground parking units`
- **Pick the distinctive noun**, not the whole phrase
- **Ask yourself**: "Could a reader ctrl+F this and find it uniquely?"

More examples:

- `"Junior to payment of outstanding indebtedness and creditor claims"` → `outstanding indebtedness`
- `"immediately following the earliest to occur of"` → `earliest to occur`
- `"lower limit is the upper unfinished surface of the concrete ground floor slab"` → `concrete floor slab`

---

## §3 `claimText` Rules — `DC-AUTH-004`, `DC-RENDER-002`, `DC-RENDER-004`

`claimText` is the Domain A text — the phrase in the asserting document that the user clicks to enter `focusPopover`. It is the scan target in `preview` and anchors the `verificationBadge`. Rules below govern how it relates to `sourceMatch` (Domain B).

### Format 1 — Anchor IS the label

`**anchor** [N]` — 1–4 verbatim words bold in prose, followed by the citation marker.

```markdown
The property includes **ground floor commercial** [3] units and **underground parking** [4].
```

### Format 2 — Anchor longer than the label

`[short label](cite:N 'longer verbatim anchor')` — `claimText` stays ≤4 words; the longer verbatim anchor goes in the quoted attribute.

```markdown
The policy covers [Group hospitalization](cite:7 'Group hospitalization and medical insurance for employees').
```

### Predicate Placement

**Predicates always stay OUTSIDE brackets.** The bracketed label is a noun phrase; the verb that operates on it stays in the prose.

- `meals are limited to **[50 percent]** [N]` ✓
- `pets must be kept **[on a leash]** [N]` ✓
- `**[ordinary household pets]** [N] may be kept` ✓
- `**[Breeding of pets for sale]** [N] is not permitted` ✓
- `The [2] Discount Rate is 8%` ✗ (marker goes after the anchor, not before)
- `The **Discount Rate** [2] is 8%` ✓

---

## §4 Citation Data Block Fields — `DC-PRE-001`, `DC-PRE-002`, `DC-DATA-001`, `DC-DATA-002`, `DC-DATA-003`

The verify CLI generates a `<<<CITATION_DATA>>>` JSON block. Model authors produce the input; these are the field rules.

Shorthand keys: `n`=id, `r`=reasoning, `f`=fullPhrase, `k`=anchorText, `p`=pageId, `l`=lineIds

```json
{
  "ATTACHMENT_ID": [
    {"n": 1, "r": "states the invoice total", "f": "The invoice totals USD 4,350.00 for services rendered by Acme Corp on March 15, 2024", "k": "USD 4,350.00", "p": "page_number_1_index_0", "l": [13, 14, 15]},
    {"n": 2, "r": "names the service provider", "f": "services rendered by Acme Corp on March 15, 2024 per the attached agreement", "k": "Acme Corp", "p": "page_number_1_index_0", "l": [2, 3, 4]},
    {"n": 3, "r": "states the service date", "f": "Acme Corp on March 15, 2024 per the attached agreement", "k": "March 15, 2024", "p": "page_number_1_index_0", "l": [4, 5, 6]}
  ]
}
```

- **`n`** — integer citation ID matching `[N]` in the body. Unique per distinct claim; never reused.
- **`r`** — brief reasoning connecting the citation to the claim (e.g. "states the conversion price").
- **`f`** — copy 1–2 verbatim sentences from the source that contain the anchor text. Must be significantly longer than `k`. Use proper JSON escaping for quotes (`\"`).
- **`k`** — the `sourceMatch` (Domain B): the verbatim short anchor located in the authoritative document. ≤4 words, ≤40 chars. Same rules as §1. Must be a contiguous substring of `f`. In Format 1 (anchor IS the label), `k` equals `claimText` exactly. In Format 2, `k` is the verbatim `sourceMatch`; `claimText` can be a shorter prose phrase. Do not describe `k` as "the bold/display text" — it is Domain B data, not Domain A.
- **`p`** — page ID. Format `"page_number_N_index_I"` where N = 1-indexed page number, I = 0-indexed array position. E.g. `"page_number_1_index_0"` (first page), `"page_number_18_index_17"` (18th page). The array index always equals N−1 for standard documents.
- **`l`** — line ID array. **`lineIds` are sparse** — not every line is tagged; use the nearest `<line id="N">` tag visible in the prepare output. **Must include the anchor's line plus 1–2 adjacent tagged neighbors** so the evidence paragraph is longer than the anchor.
  - Example: if `<line id="20">` is the nearest tag above your anchor, use `l: [19, 20, 21]` (nearest tagged neighbors) or `l: [20, 21]` (minimum).

---

## §5 QA Issue Taxonomy — `DC-REVIEW-001`

Every citation reviewer classifies failures using this vocabulary. Severity drives grading (§6).

Each issue maps to a domain invariant from `deep-citation-concepts.md`: Domain B issues prevent the `sourceMatch` from being located or highlighted; Domain A issues degrade the `claimText` scan target in `preview`; cross-domain issues break the `isVerbatim` comparison or the `keyholeViewport` framing.

| Issue | Severity | Domain | Definition |
|-------|----------|--------|------------|
| `NOT_FOUND` | High | Domain B | `sourceMatch` not located in the authoritative document — `keyholeViewport` cannot frame the anchor |
| `LONG_ANCHOR` | High | Domain B | `sourceMatch` exceeds 4 words — too large to serve as a precise scan anchor in the keyhole |
| `NOT_SUBSTRING` | High | Domain B | `sourceMatch` is not a verbatim substring of `sourceContext` — breaks the containment invariant (`sourceMatch ⊂ sourceContext`) |
| `PARTIAL` | Medium | Domain B | `sourceMatch` found but `keyholeViewport` highlight bounds are incomplete |
| `LONG_LABEL` | Medium | Domain A | `claimText` exceeds 4 words — clutters the `preview` scan anchor |
| `PLACEMENT` | Medium | Domain A | `claimText` absent from prose before the citation marker — breaks `preview` scan anchor positioning |
| `ELLIPSIS` | Low | Domain B | `sourceMatch` contains `...` — not a contiguous substring; keyhole may frame the wrong region |
| `LABEL_ANCHOR_DISCONNECT` | Uncertain | Cross-domain | `claimText` shares no distinctive word with `sourceMatch` — the user cannot connect Domain A to Domain B at a glance |
| `MULTI_VALUE_ANCHOR` | Uncertain | Domain B | Entire multi-value field cited instead of one value — `sourceMatch` is not the most distinctive contiguous substring |
| `LAZY_LINEID` | Uncertain | Domain B | `l` defaults to page's first line — `sourceContextDeepItem` bounding box points to the wrong region, causing the keyhole to frame irrelevant content |

---

## §6 Grading Rubrics — `DC-VERIFY-001`, `DC-VERIFY-002`, `DC-VERIFY-003`, `DC-REVIEW-001`

### Found Rate Targets

| Metric | Standard domains | Research domains |
|--------|------------------|------------------|
| Found rate | >80% | >85% |
| Partial rate | <15% | <15% |
| Not-found rate | <5% | <5% |

### Per-Citation Grade

Sample at least 5 citations per report. Grade on 6 dimensions. Each dimension maps to a role in the scan UX defined in `deep-citation-concepts.md`:

| Dimension | Concepts.md role | A | B | C | F |
|-----------|-----------------|---|---|---|---|
| **Display** (`claimText`) | Domain A scan target in `preview` — the `verificationBadge` anchor | Natural, 1–4 words | Slightly awkward or 5 words | Clause fragment | >8 words or ungrammatical |
| **Anchor** (`sourceMatch`) | Domain B scan anchor in `focusPopover` — the `keyholeViewport` centers on this | Verbatim 1–4 word key term | Verbatim but generic or 5+ words | Paraphrased/truncated awkwardly | Wrong term |
| **Evidence** (`sourceContext`) | Domain B visual tier — the region framed by `contextBrackets` and lit by `spotlight` in `pageView` | Exact substantive passage | Correct passage, imprecise location | Related section | Header, noise, or unrelated |
| **Relevance** | Cross-domain comparison — does the `sourceMatch` actually support the `claimText`? | Directly supports claim | Indirect support | Tangential | Does not support |
| **Prose** | `preview` readability — `claimText` must read naturally in the asserting document | Reads perfectly without brackets | Minor awkwardness | Noticeably disrupted | Unreadable |
| **Concise** (`sourceMatch` length) | Keyhole precision — shorter `sourceMatch` → tighter `keyholeViewport` → faster scan | 1–3 words | 4 words | 5–6 words | 7+ words |

Letter-grade thresholds for per-citation rollup: A ≥90%, B ≥75%, C ≥60%, F <60%.

### Overall Report Grade

- **A**: 0 high-severity issues, ≤1 medium
- **B**: 1–2 high-severity OR 2–4 medium
- **C**: 3–5 high-severity OR systemic medium issues
- **D**: >5 high-severity OR found rate <80%

---

## §7 Stubborn Patterns (Accepted Exceptions)

These are known failure modes that reviewers should **not** keep filing as new issues. They are either structural false positives in the extraction script or residual model behaviors we have chosen to tolerate.

- **Proper noun expansion** — model writes the full name ("Simple Agreement for Future Equity") instead of the abbreviation ("SAFE"). ~5% residual; may need CLI-side correction rather than a prompt fix.
- **Negation reconstruction** — source says "Neither X nor Y are transferable" → model writes "not transferable". Non-verbatim by construction; needs an explicit NOT example in the verify skill if it recurs.
- ~~**List-item PLACEMENT false positives**~~ — **Fixed in extractor** (Apr 2026). `review_extract.py` now strips HTML tags from `pre` before placement check and treats empty pre-context as placement-OK. Tests: `TestListItemPlacementFP` in `scripts/tests/test_review_extract.py`.
- ~~**Bold-text PLACEMENT false positives**~~ — **Fixed in extractor** (Apr 2026). `review_extract.py` now strips HTML tags from the display label before comparing to pre-context. Tests: `TestBoldTextPlacementFP`.
- ~~**Smart-quote NOT_SUBSTRING false positives**~~ — **Fixed in extractor** (Apr 2026). `review_extract.py` now normalises curly/smart quotes to ASCII before substring comparison. Tests: `TestSmartQuoteNotSubstringFP`.
- **Inline-quote PLACEMENT false positives** — in analytical, legal, or regulatory documents that embed verbatim source quotes inline (pattern: `prose "quoted phrase [N]"`), the citation span IS the quoted text at its first and only appearance. The PLACEMENT check expects the label to appear *before* the span, but the span wraps the first occurrence. Distinct from list-item FP (not in `<li>`) and bold-text FP (no `<strong>`). Evidence: 75% FP in a legal dispute analysis, 88% FP in a tax-regulatory PDF. Confirmed across legal and tax/regulatory domains.
- **Summary-enumeration PLACEMENT false positives** — in academic survey and research documents that use bullet-point or enumerated summaries, citations wrap technical terms that appear as list-item values, series members, post-colon values, or post-preposition values. The citation span IS the enumerated term — there is no prose precursor by design. The PLACEMENT check fires because the label text doesn't appear verbatim *before* the `<span>`. Distinct from inline-quote FP (no quotation marks, no legal prose). Trigger patterns: `Core objectives: [Robustness]`, `Controllability, and [Ethicality]`, `emphasized: [RLHF]`, `such as [Iterated Distillation]`, `signed by [28 countries]`. Evidence: `2310.19852-verified.html` (AI alignment survey) — 14/14 PLACEMENT flags (100%) are FPs; 0 genuine violations. Domain: academic/scientific. **Promoted to §7 (Apr 2026).**

---

## §8 Playwright Hard Gates — `DC-UX-001`, `DC-UX-002`, `DC-UX-003`, `DC-UX-004`, `DC-UX-005`, `DC-UX-006`

These tests must pass before any verified report ships. They are hard assertions; a failure blocks the PR. Each test protects a specific scan anchor or domain invariant from `deep-citation-concepts.md`.

| Test | Name | Protects | Assertion |
|------|------|----------|-----------|
| 4 | Anchor quality | `sourceMatch` as `focusPopover` scan anchor | `sourceMatch` ≤40 chars, ≤4 words, verbatim substring of `sourceContext` — 0 violations |
| 6b | Snippet tokenization | `sourceContext` readability in popover quote | `verifiedMatchSnippet` has no hyphen-padding (`"fifty - one"`) or space-before-punct (`"units ;"`) artifacts — 0 padded |
| 6c | Snippet coherence | `sourceContext` as valid Domain B text | No duplicated stopwords (`"the the"`) or 1.6×-oversized splicing from pageText fallback — 0 frankensteined |
| 12 | Evidence overlay + highlight | `keyholeViewport` visual tier rendering | `[data-dc-annotation-overlay]` + `[data-dc-anchor-highlight]` render after page pill click — ≥1 verified citation has overlay |
| 13 | Full chain | The complete `preview` → `focusPopover` → `pageView` scan chain | display → popover → evidence → highlight all work end-to-end — all 4 steps pass |
| 15 | Keyhole anchor in view | `keyholeViewport` pan invariant (anchor centered on render) | `[data-dc-keyhole]` scroll position places ≥50% of anchor highlight width in viewport on render — ≥80% of sampled citations pass |

**Playwright spec location**: `packages/deepcitation-web/src/__tests__/playwright/scenarios/verify-qa-check.spec.ts`

---

## §9 Verification UX Contract: The <1-Second Confidence Path — `DC-UX-001`, `DC-UX-005`, `DC-UX-006`

The goal of every citation interaction is that users feel confident in verification **within less than a second** — without having to think, scroll, or track context across state transitions.

The three view states (`preview`, `focusPopover`, `pageView`) each designate one **scan anchor** whose job is to reacquire attention on reset. The chain progresses from abstract to concrete: `verificationBadge` → `keyholeViewport` (cropped real pixels) → `spotlight` (full page with attenuation). Every implementation decision must preserve this progression.

### The Chain

```
preview                →    focusPopover            →    pageView
(claimText + badge)         (sourceMatch highlighted       (spotlight dims surroundings,
                              in sourceContext quote,        contextBrackets frame sourceContext,
                              keyholeViewport centered       sourceMatch stays in focus)
                              on sourceMatch)
```

Each step must make the connection from the previous step **visually obvious** — not something the user has to reconstruct.

### Implementation Requirements

0. **Clickable claim text** — in `preview`, the visible `claimText` phrase is part of the
   interactive citation trigger. The user must be able to click the words being verified,
   not only a trailing badge, icon, caret, or tiny marker.

1. **Quote popover** — when opened, `sourceMatch` is highlighted within the quote snippet immediately (no user action). The highlight must be visible without scrolling inside the popover.

2. **Evidence image** — rendered at a size where the highlighted `sourceMatch` is readable without zooming. The image must be pre-scrolled (or cropped/framed) so the anchor region is in the viewport on arrival, not buried below the fold.

3. **Expanded / full-page view** — opening this from the evidence image must keep the `sourceMatch` region in focus. Use **match-cut or shared-element transition**: the highlighted text or anchor region animates continuously from the small evidence image into its position on the full page. The user's eye never loses track of where the anchor lives.

4. **Animation technique: match-cut** — the anchor highlight (or its bounding box) must be the **shared element** across the evidence→full-page transition. It should not disappear and reappear; it should transform in place. This is the same principle used in iOS photo expansion and Google Maps place-card transitions.

5. **No threshold moment** — at no point in the chain should the user need to re-orient. The highlight color, shape, and position must be continuous. Prefer CSS `view-transition` or FLIP animation over hard cuts.

6. **Same-fact visual target** — every visible connector, badge, keyhole, bracket,
   spotlight, and highlight belongs to the same fact as the clicked `claimText`. In
   tables/lists, pointing one row below or above the clicked claim is a blocker, even if
   the source page itself is correct.

### What This Rules Out

- Evidence image that loads without the anchor pre-scrolled into view — requires the user to hunt
- Full-page opening that jumps to top of page — loses context entirely
- Popover that shows quote text without highlighting the anchor — user must read to find it
- Transition that fades out the highlight and fades it back in — breaks the connection
- Badge-only click targets where the visible claim text does nothing
- Connectors or keyholes that point at an adjacent table/list row instead of the clicked claim

---

## §10 Popover Quote Highlighting (Hard) — `DC-UX-002`

The citation popover displays the `sourceContext` as a quote with the `sourceMatch` highlighted inline. This is the first moment the user connects `claimText` to its source — it must be instant and unambiguous.

### Invariants

- **Anchor is visually distinct within sourceContext** — the `sourceMatch` substring renders with an amber background highlight (`ANCHOR_HIGHLIGHT_STYLE`: `rgba(251, 191, 36, 0.2)`, 2px border-radius) while the surrounding sourceContext text renders in `text-dc-muted-foreground`. The user sees the highlighted anchor embedded in the unhighlighted full quote — never the anchor alone.
- **Matching is resilient** — the highlight algorithm uses a 4-tier fallback: exact match → case-insensitive → quote-normalized (curly ↔ ASCII) → fuzzy word-span (handles inline section markers like "§6.1"). If none match, the full phrase renders unhighlighted rather than crashing.
- **Context window, not full dump** — when `sourceContext` exceeds ~300 characters, the display trims to a ±150-character window around the anchor with leading/trailing `...` indicators. The anchor is always centered in the visible window.
- **Miss state suppresses highlight** — when `isMiss === true`, the text renders in `text-dc-destructive` (red) without an anchor highlight, because the anchor was not found in the source.

### Implementation References

- `HighlightedPhrase` component: `packages/deepcitation/src/react/HighlightedPhrase.tsx`
- `ClaimQuote` in `DefaultPopoverContent.tsx`: wraps `HighlightedPhrase` in a left-bordered quote block
- `VerificationLogTimeline` in `VerificationLog.tsx`: uses same `sourceContext`/`sourceMatch` props with `trimPhraseToAnchorWindow()` for the search log's "looking for" section

---

## §11 Keyhole Evidence Image: Pan & Zoom (Hard) — `DC-UX-003`

The keyhole is a horizontally-scrollable strip that shows the evidence page image zoomed to the `sourceMatch` region. On render, the anchor text must be **in view, readable, and centered** — the user should never need to pan or zoom to find it.

### Zoom Invariants

- **Anchor fill target** — the zoom level is computed so the anchor text fills ~70% of the keyhole width (`KEYHOLE_ANCHOR_FILL_TARGET = 0.7`). This is the sweet spot: large enough to read, small enough to show surrounding context.
- **Never upscale** — zoom is capped at `1.0`. The keyhole never magnifies beyond the image's native resolution. Expanding to full-page view reveals more detail.
- **Minimum readability** — zoom floor is `1 / renderScale.y` (~12pt equivalent). The anchor text must never be too small to read at a glance.

### Pan Invariants

- **Anchor centered on render** — the initial scroll position places the anchor text's center at the horizontal and vertical center of the keyhole viewport. If the anchor is at the left edge of the page, it scrolls left; if at the right, it scrolls right. The user sees the anchor immediately, not the page's default left edge.
- **Horizontal alignment follows anchor position** — the keyhole pans to wherever the anchor actually lives on the page (left, center, or right). There is no fixed "always start at left" behavior.
- **Snippet mode** — when the evidence source is a cropped snippet rather than a full page, the component detects that anchor coordinates fall outside the crop's natural bounds and recalculates the pan offset relative to the phrase match region within the snippet.

### Fade & Overflow

- **Edge fade masks** — when the image extends beyond the keyhole viewport, 32px gradient fades (`KEYHOLE_FADE_WIDTH`) appear on the overflowing edges (left, right, or both) to signal pannable content.
- **Pan arrows** — directional arrow buttons appear on hover when scrollable overflow exceeds 24px (`MIN_PAN_OVERFLOW_PX`). Arrow click pans by 50% of viewport width or 80px (whichever is larger), animated over 180ms.
- **Drag-to-pan** — mouse drag pans on both X and Y axes. Touch uses native overflow scroll.

### What This Rules Out

- Keyhole that loads showing the top-left corner of the page while the anchor is bottom-right — user must pan twice
- Anchor text so zoomed-in that only 1–2 characters are visible — unreadable
- Anchor text so zoomed-out that it's a few pixels tall — unreadable
- Snippet evidence that ignores coordinate-space mismatch and renders the anchor off-screen

### Implementation Reference

- `AnchorTextFocusedImage`: `packages/deepcitation/src/react/evidence/AnchorTextFocusedImage.tsx`
- Scroll target computation: `computeAnnotationScrollTarget()` in `packages/deepcitation/src/react/overlayGeometry.ts`

---

## §12 FullPhrase Bounding Box Accuracy (Hard) — `DC-DATA-002`, `DC-DATA-003`, `DC-UX-004`

The `sourceContext` drives both the popover quote display (§10) and the evidence image crop region. An inaccurate sourceContext bounding box cascades into wrong keyhole framing and misleading highlights.

### Invariants

- **No false-positive leading words** — common words like "The", "A", "In", "For" that appear hundreds of times on a page must not anchor the bounding box to a completely different region. The sourceContext search must match the **contiguous phrase**, not individual word hits scattered across the page.
- **Bounding box covers the actual phrase location** — the `sourceContextDeepItem` (or `sourceContextDeepItems`) coordinates must correspond to the line(s) where the phrase actually appears, not a false positive match at the top or bottom of the page.
- **Anchor match is preferred over phrase match for zoom targeting** — `sourceMatchDeepItems[0]` is used as the primary zoom/pan target, with `sourceContextDeepItem` as fallback. This avoids cases where a long sourceContext spans multiple lines and the bounding box center is far from the anchor.
- **Line IDs must be accurate** — per §4, the `l` array in `CITATION_DATA` must include the anchor's actual line plus 1–2 neighbors. Defaulting to the page's first line (`l: [0]` or `l: [1]`) produces a bounding box at the wrong vertical position, causing the keyhole to frame the wrong region entirely.

### Common Failure Modes

| Failure | Root Cause | Effect |
|---------|-----------|--------|
| Keyhole shows page header instead of anchor | `sourceContext` starts with "The" which matches a "The" in the header; bounding box Y is wrong | User sees irrelevant content |
| Keyhole shows bottom of page | `sourceContext` ends with a common word that matches near the footer | Anchor is above the viewport |
| Evidence crop is wildly tall | `sourceContext` has false-positive word matches at top AND bottom of page, expanding the bounding box | Zoom is too small to read |
| Anchor highlight is correct but context is wrong | `sourceMatchDeepItems` is accurate but `sourceContextDeepItem` points elsewhere | Snippet mode miscalculates offset |

### What This Rules Out

- FullPhrase search that matches individual words independently rather than the contiguous phrase
- Line ID arrays that default to `[0]` or `[1]` regardless of where the anchor actually appears on the page
- Bounding boxes that span the full page height because of scattered word matches

### Relationship to Animation Rules

This section defines the **product contract** (what must be true for the user). Implementation details (CSS transitions, Framer Motion, `scrollIntoView` options, image clipping) live in `packages/deepcitation/docs/agents/animation-transition-rules.md`. When adding or modifying citation evidence UI, read both: this doc for the invariant, `animation-transition-rules.md` for the technique.
