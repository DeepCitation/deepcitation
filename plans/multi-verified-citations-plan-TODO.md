# Stack Adjacent Citations Into One Popover (TDD-first)

## Context

When the verifier produces two citations that anchor to the same inline claim text, the CLI's markdown→HTML pass emits them as **two sibling spans**, the second of which has empty text content:

```html
<strong>
  <span data-citation-key="cdf0c6451c624a75">AI Alignment</span>
  <span data-citation-key="b8cf9e7bed40b911"></span>
</strong>
```

The CDN runtime (`bindTriggers`) binds click handlers and appends a status indicator to **every** `[data-citation-key]`. The reader sees:

1. a normal, easy-to-click badge glued to the claim text, immediately followed by
2. a second badge that has **no surrounding text** → a near-zero-width hit target the user has to pixel-hunt.

Two occurrences in the sample report (`examples/output/ai-alignment-survey.pdf-verified.html`, lines 124 & 126) prove this is reproducible; `wrapCitationMarkers` in `src/cli/markdownToHtml.ts` produces it any time two `[N][M]` markers sit back-to-back.

**Goal**: detect these adjacent citations during HTML emission and render them as a **single stacked trigger** whose popover exposes both citations (tabs `1 / 2`), so one click surfaces all the evidence the claim leans on.

## Root Cause

`wrapCitationMarkers` in `src/cli/markdownToHtml.ts` processes one `[N]` marker per regex iteration. On the second marker of a `[N][M]` pair:

- `src/cli/markdownToHtml.ts:131` — regex `([^<>"]*?)\s*\[(\d+)\]` matches with empty `textBefore` because the first marker already consumed the text.
- `src/cli/markdownToHtml.ts:133` — `if (!trimmed) return '<span data-cite="${num}"></span>'` emits the empty span.
- `src/cli/markdownToHtml.ts:156-157` — a second failure mode for punctuation-only anchors also emits empty spans.

Empty spans pass through `replaceCitationMarkers` (`src/vanilla/reportUtils.ts:173`) unchanged, then get bound 1:1 by `bindTriggers` (`src/vanilla/runtime/cdn.ts:629`).

## Strategy

Fix at the **HTML-string boundary** rather than at source (the regex), at React (hydration), or at CSS (widening hit targets). The string boundary is already traversed by both the CLI report codepath AND the CDN runtime injection, so one change covers regenerated reports *and* re-injection of previously-generated HTML.

**TDD discipline**: every layer below is written test-first. Each test file is added, watched to **fail red**, and only then is implementation written to turn it green. The previous iteration of this plan was rejected for being "too buggy"; the fix is to push the thinking into tests up front rather than discovering cases in the implementation.

## Layer-by-layer plan

### Layer 1 — `collapseAdjacentCitations` (pure string transform)

**New exported helper** in `src/vanilla/reportUtils.ts`:

```ts
export function collapseAdjacentCitations(html: string): string
```

**Behavior (what the tests assert):**

1. Finds patterns of the form `<span data-citation-key="K1" …>TEXT</span><WS><span data-citation-key="K2" …>EMPTY</span>`, where:
   - `TEXT` is non-empty (after HTML-tag stripping + whitespace trim)
   - `EMPTY` is empty OR whitespace-only OR contains only empty inline tags (e.g. `<em></em>`, `&nbsp;`, `&#8203;`, `<br>`)
   - `WS` is zero-or-more whitespace characters (including newlines)
2. Merges into one span: keeps `K1` as the primary `data-citation-key`, appends a new attribute `data-dc-extra-keys="K2"`, preserves the original text content and all other attributes on the first span. Deletes the second span.
3. Iterates until no more matches so chains of 3+ empty spans collapse to `data-dc-extra-keys="K2,K3"`.
4. Is **idempotent**: running it on already-collapsed HTML produces identical output (bit-for-bit). If the first span already has `data-dc-extra-keys`, the new key is appended to the existing list, deduped.
5. Does **not** cross non-whitespace text between the two spans. `<span>A</span> and <span></span>` → unchanged.
6. Does **not** cross non-inline elements between the two spans. `<span>A</span><p><span></span></p>` → unchanged.
7. Preserves wrapper elements that contain *both* spans, e.g. `<strong><span>A</span><span></span></strong>` → `<strong><span …>A</span></strong>`.
8. If the first span already has `data-dc-display-label`, it is preserved unchanged.
9. If the second span has `data-dc-display-label`, it is discarded (the merged span uses the first span's visible text).
10. Preserves HTML entities in the text content (`&amp;`, `&lt;`, etc.) — since we're string-splicing rather than DOM-parsing, this is automatic but must be asserted.

**Algorithm (implementation sketch, written AFTER tests fail):**

Regex-based, consistent with `autoFixDisplayLabels` which already uses regex at `reportUtils.ts:226`:

```
const PAIR_RE = /<span\s+([^>]*?)data-citation-key="([0-9a-f]+)"([^>]*)>([\s\S]*?)<\/span>(\s*)<span\s+([^>]*?)data-citation-key="([0-9a-f]+)"([^>]*?)>([\s\S]*?)<\/span>/g;
```

For each match:
- Strip `<[^>]+>` + `&nbsp;` + `&#8203;` + whitespace from the second span's body. If result is empty → merge. Otherwise, skip.
- Re-emit the first span with `data-dc-extra-keys` appended (or updated if already present), followed by `WS`.

Run in a `while (result !== prev)` loop for idempotency + chain-collapse.

**Edge case: greedy regex swallowing.** Standard trap — `[\s\S]*?` is lazy, so the inner content doesn't consume across sibling spans, but the outer pair match could theoretically skip intermediate text. Tests #11 and #12 below verify this explicitly.

**Edge case: SVG/script tags near spans.** `autoFixDisplayLabels` has the same risk and has shipped without incident, so relying on the same approach is acceptable.

#### Test file: `src/__tests__/collapseAdjacentCitations.test.ts`

All tests are written **first**, verified to fail, then implementation added. Uses `@jest/globals` to match `reportUtils.test.ts`.

```ts
import { describe, expect, it } from "@jest/globals";
import { collapseAdjacentCitations } from "../vanilla/reportUtils.js";
```

**Section A — basic collapse:**

1. `A1` Two adjacent spans, second empty, no wrapper → `<span data-citation-key="k1">T</span><span data-citation-key="k2"></span>` becomes `<span data-citation-key="k1" data-dc-extra-keys="k2">T</span>`.
2. `A2` Inside `<strong>`: `<strong><span data-citation-key="k1">T</span><span data-citation-key="k2"></span></strong>` → `<strong><span data-citation-key="k1" data-dc-extra-keys="k2">T</span></strong>`.
3. `A3` Inside `<em>` (different inline wrapper) — same shape, proves wrapper-agnosticism.
4. `A4` Inside `<li>`: verifies list items work.
5. `A5` Whitespace only between the two spans: `<span>T</span>\n  <span></span>` → still collapses; the whitespace is *deleted* (trailing whitespace after the collapsed span would be spurious).
6. `A6` Second span contains `&nbsp;` only → collapses.
7. `A7` Second span contains `&#8203;` (zero-width space) only → collapses.
8. `A8` Second span contains empty `<em></em>` → collapses.
9. `A9` Second span contains `<br>` → collapses.
10. `A10` Second span contains only whitespace characters (` `, `\n`, `\t`) → collapses.

**Section B — chain handling:**

11. `B1` Three consecutive: `<span k="k1">T</span><span k="k2"></span><span k="k3"></span>` → `<span k="k1" data-dc-extra-keys="k2,k3">T</span>`.
12. `B2` Four consecutive → `data-dc-extra-keys="k2,k3,k4"`.
13. `B3` Two separate adjacent pairs in the same document → both collapsed, none leaking across the midpoint.

**Section C — no-ops (regression guards):**

14. `C1` Spans with actual text between them: `<span>A</span> and also <span></span>` → unchanged.
15. `C2` Second span is non-empty: `<span>A</span><span>B</span>` → unchanged.
16. `C3` Second element is not a span: `<span>A</span><a data-citation-key="k2"></a>` → unchanged (the helper is intentionally span-specific; `bindTriggers` binds any element but the collapse pass scopes to spans so we don't blow up unrelated markup).
17. `C4` Non-inline element between: `<span>A</span><p><span></span></p>` → unchanged.
18. `C5` Empty string input → empty string output.
19. `C6` HTML with no citation spans → returned identically.
20. `C7` Single span (no empty sibling) → returned identically.
21. `C8` Two spans separated by `<br>`: `<span>A</span><br><span></span>` → unchanged (block break = not adjacent).

**Section D — attribute preservation:**

22. `D1` First span has `data-dc-display-label="shown text"` → preserved on merged span.
23. `D2` Second span has `data-dc-display-label` → discarded.
24. `D3` First span has extra unknown attributes (`class`, `id`, `data-foo`) → all preserved.
25. `D4` Attribute order on merged span: `data-citation-key` first, `data-dc-extra-keys` immediately after (stable for snapshot tests and for grepping).
26. `D5` Text content with HTML entities: `<span>&amp; test</span><span></span>` → text `&amp; test` preserved exactly.
27. `D6` Text content with inline children: `<span data-citation-key="k1"><code>foo</code></span><span data-citation-key="k2"></span>` → merged, `<code>foo</code>` preserved.

**Section E — idempotency:**

28. `E1` Calling `collapseAdjacentCitations` twice produces identical output on the second call (tested for each of A1, A2, B1 cases).
29. `E2` Already-collapsed span with `data-dc-extra-keys="k2"` followed by a new empty span with `data-citation-key="k3"` → merges into `data-dc-extra-keys="k2,k3"`.
30. `E3` Duplicate extra keys: `<span k="k1" data-dc-extra-keys="k2">T</span><span k="k2"></span>` → `data-dc-extra-keys="k2"` (no duplicate; the helper dedupes).

**Section F — exemplar regression:**

31. `F1` Load `examples/output/ai-alignment-survey.pdf-verified.html` via `fs.readFileSync`. Assert the raw input contains at least one `<span data-citation-key="[^"]*"></span>`. Run `collapseAdjacentCitations` on it. Assert the output contains zero such empty spans, and contains at least one `data-dc-extra-keys=` attribute. (This makes the plan self-verifying against the real-world input the user flagged.)

**Exit criterion for Layer 1:** all 31 tests green. No other layers touched.

### Layer 2 — `bindTriggers` resolves extra keys

**Changes to** `src/vanilla/runtime/cdn.ts:629-646`:

- After reading primary `data-citation-key`, also read `data-dc-extra-keys` (split on comma, trim, drop empties, drop keys absent from `verifications`).
- Build `entries: VerificationData[]` = `[verifications[primary], ...extras.map(k => verifications[k])]`.
- On click, call `showPopoverFor(trigger, entries)` — the function's parameter type changes from `VerificationData` to `VerificationData[]`.
- The status indicator is still appended exactly once to the trigger, keyed off `entries[0]` (the primary). This matches today's visible behavior.

**Test file: extend** `src/__tests__/cdnPopover.test.tsx` **OR new** `src/__tests__/cdnBindTriggers.test.tsx`.

Decision: new file, because `bindTriggers` is a DOM side-effect function that the existing `cdnPopover.test.tsx` (which tests React component output) doesn't currently drive. A fresh fixture is cleaner than smuggling DOM scaffolding into an existing component test.

**Tests (all fail red before implementation):**

1. `B-T1` Setup: JSDOM document with `<span data-citation-key="k1">T</span>`. Call `bindTriggers("[data-citation-key]")` with `verifications = { k1: mockVD }`. Click the span. Assert a spy on `showPopoverFor` was called with `entries.length === 1` and `entries[0] === verifications.k1`. (Baseline — proves the refactor didn't break the single-citation path.)
2. `B-T2` `<span data-citation-key="k1" data-dc-extra-keys="k2">T</span>` with `verifications = { k1, k2 }`. Click → `entries.length === 2`, in order `[k1, k2]`.
3. `B-T3` `data-dc-extra-keys="k2,k3"` with all three present → `entries.length === 3`.
4. `B-T4` `data-dc-extra-keys="k2"` where `k2` is **missing** from `verifications` → falls back silently to `entries.length === 1` with only `k1`. (Graceful degradation — missing verifications shouldn't break the click.)
5. `B-T5` `data-dc-extra-keys=""` (empty string) → `entries.length === 1`.
6. `B-T6` Whitespace in the attribute: `data-dc-extra-keys=" k2 , k3 "` → parsed as `[k2, k3]`.
7. `B-T7` Exactly one status indicator appended to the trigger (not N). Assert `trigger.querySelectorAll('.dc-status-indicator').length === 1`.
8. `B-T8` Re-binding (calling `bindTriggers` twice on the same DOM) does not attach a second click handler — verified by clicking once and asserting the spy was called exactly once.
9. `B-T9` Primary key's verification is missing but extras are present → the trigger is **skipped** entirely (matches the existing early-return on `!verifications[key]` at `cdn.ts:634`). Assert no click handler is attached.

**Testing technique:** import the `bindTriggers` function. To do that without cargo-culting the whole `cdn.ts` module (which has side effects on import — style injection, etc.), the plan extracts `bindTriggers` into a new sibling module `src/vanilla/runtime/cdn-bindings.ts`. `cdn.ts` imports & re-exports from there. This is a small refactor but it's the only way to unit-test the function in isolation without running the whole CDN boot path.

**Note on module extraction:** this is the one architectural refactor in the plan. It's justified by the TDD requirement — `bindTriggers` is currently tangled with module-scope state (`boundTriggers`, `verifications`, `activeIndicatorVariant`). The refactor makes it take those as parameters, which is also what the new test needs.

### Layer 3 — Stacked popover content

**Changes to** `CdnPopoverWrapper` **in** `src/vanilla/runtime/cdn.ts:169-209`:

```ts
function CdnPopoverWrapper(props: {
  entries: Array<{
    citation: Citation;
    verification: Verification;
    pageImages: PageImage[] | undefined;
    status: ReturnType<typeof getStatusFromVerification>;
    sourceLabel: string | undefined;
    downloadUrl: string | undefined;
    claimText?: string;
  }>;
  onDismiss: () => void;
})
```

- `entries.length === 1` → renders `DefaultPopoverContent` exactly as today, zero visual/behavioral change.
- `entries.length > 1` → renders a tab strip above a **single** `DefaultPopoverContent` whose props come from `entries[activeIndex]`. The one-component-instance-props-swap rule is mandatory to avoid the React-19 fiber-destroy crash documented in memory (`EvidenceZone` triple-always-render pattern).
- Tab strip UI: horizontal row of `<button>` elements, one per entry, with `aria-selected`, `role="tab"`, and a status dot colored by each entry's `status`. Keyboard: `ArrowLeft`/`ArrowRight` cycle tabs, `Home`/`End` jump to first/last. Labels: `1 / N`, `2 / N`, … (visible), plus `aria-label="Citation 1 of 2 — verified"` for screen readers.
- On tab switch: reset `viewState` to `"summary"` (don't try to preserve expanded-evidence/expanded-page across different citations; the new citation's evidence wouldn't match the expanded state).
- `escapeInterceptRef` remains wired to `DefaultPopoverContent` and still dismisses the popover on Escape — tab navigation must not consume Escape.

**Test file: extend** `src/__tests__/cdnPopover.test.tsx`.

**Tests:**

1. `P1` `entries.length === 1` renders no tab strip. Assert `queryByRole('tablist')` is null and the rendered popover is byte-identical to the current snapshot (use the existing snapshot test if one exists; otherwise compare key DOM text).
2. `P2` `entries.length === 2` renders a tab strip with two tabs (`role="tab"`), labeled `1 / 2` and `2 / 2`.
3. `P3` Initial active tab is index 0. Assert the rendered claim text matches `entries[0].claimText`.
4. `P4` Click tab 2 → rendered claim text matches `entries[1].claimText`. Also assert evidence image src matches `entries[1]`'s `pageImages[0].imageUrl` or evidence.
5. `P5` **Instance stability under tab switch**: capture the `popoverContentRef` DOM node on mount, switch tabs, assert the node identity is unchanged (`expect(refAfter).toBe(refBefore)`). This is the crash-prevention assertion — proves `DefaultPopoverContent` was not remounted.
6. `P6` Status color per tab: entry[0] is `verified`, entry[1] is `miss` → tab 1 dot is green, tab 2 dot is red. Uses existing `STATUS_COLORS` constants.
7. `P7` Keyboard `ArrowRight` advances active tab by 1; `ArrowLeft` moves back; `Home`/`End` jump to extremes.
8. `P8` Escape key still fires `onDismiss` when a tab is focused (does not get swallowed by arrow-key handler).
9. `P9` Switching tabs while `viewState === 'expanded-evidence'` resets view state to `'summary'`. Verified by asserting the evidence is rendered in summary layout after the click.
10. `P10` Tab strip's tabs have `aria-selected="true"` on the active tab and `"false"` on the others.
11. `P11` Long-text tab labels don't overflow: for `entries.length === 5`, the tab strip stays within the popover max-width (`contentRect.width <= maxContentWidth`). Uses `getBoundingClientRect`.
12. `P12` Three+ entries: clicking tab 3 after tab 2 shows `entries[2]` content.

### Layer 4 — Call-site wiring

Now invoke `collapseAdjacentCitations` from its two call sites:

1. `src/vanilla/reportUtils.ts::injectCdnRuntime` — add the call immediately after `autoFixDisplayLabels` (around line 278+), before `injectCdnRuntime` stamps the runtime payload. Return the transformed HTML through the rest of the pipeline.
2. `src/cli/commands.ts` (~L1094-1112) — add the call after the existing numeric→hash replacement loop. This covers the CLI report generation codepath, which doesn't always go through `injectCdnRuntime`.

**Test file: extend** `src/__tests__/reportUtils.test.ts`.

**Tests:**

1. `I1` `injectCdnRuntime` called on HTML containing an adjacent-empty pair → output HTML has one collapsed span and zero empty `[data-citation-key]` spans. This is a **pipeline** test, not a unit test of `collapseAdjacentCitations` — it proves the call site was actually wired.
2. `I2` Existing `injectCdnRuntime` happy-path test still passes (regression guard).
3. `I3` `injectCdnRuntime` called on a re-injected HTML (one that already contains `data-dc-extra-keys`) is idempotent — second call produces the same output.

**Test file: extend** `src/__tests__/cliInject.test.ts` OR `cliCommands.test.ts`.

4. `I4` CLI-level: run `commands.ts` report-generation path with a fabricated `CitationRecord` that would produce adjacent spans, assert the final HTML has collapsed spans. Smaller than a true E2E but exercises the real code path.

### Layer 5 — End-to-end exemplar verification

This isn't a unit test — it's a manual/integration check on the actual file the user reported:

1. `E-E1` In `src/__tests__/collapseAdjacentCitations.test.ts` test `F1` (already listed in Layer 1), load `examples/output/ai-alignment-survey.pdf-verified.html` from disk, run the helper on it, and assert the adjacent pairs are collapsed. This is a fixture-backed regression test, fast enough to run in CI.
2. Manual browser smoke: after implementation, re-run verify on `ai-alignment-survey.pdf` → open the regenerated report → click the "AI Alignment" badge → expect popover with `1 / 2` tab strip → click tab 2 → expect content swap with no fiber-destroy console errors.

## TDD Execution Order

1. **Commit A — Layer 1 tests red.** Add `collapseAdjacentCitations.test.ts` with all 31 tests (Sections A–F). Add stub `export function collapseAdjacentCitations(html: string): string { return html; }` to `reportUtils.ts`. Run tests → expect all A, B, D, E, F tests to fail; C tests to pass (because stub passes through). Commit.
2. **Commit B — Layer 1 green.** Implement `collapseAdjacentCitations`. Run tests → all green. Commit.
3. **Commit C — Module extraction for Layer 2.** Extract `bindTriggers` and its direct dependencies into `src/vanilla/runtime/cdn-bindings.ts`. `cdn.ts` re-exports. **No behavior change, no test changes** — this commit should leave the existing test suite green. Commit.
4. **Commit D — Layer 2 tests red.** Add `cdnBindTriggers.test.tsx` with 9 tests. Most will fail because `data-dc-extra-keys` isn't read yet. Commit.
5. **Commit E — Layer 2 green.** Update `bindTriggers` + `showPopoverFor` signature to accept arrays. Existing `cdnPopover.test.tsx` continues to pass (tests still feed a single entry via the shim). Commit.
6. **Commit F — Layer 3 tests red.** Add P1–P12 to `cdnPopover.test.tsx`. Many fail. Commit.
7. **Commit G — Layer 3 green.** Update `CdnPopoverWrapper` to accept `entries[]` and render the tab strip. Commit.
8. **Commit H — Layer 4 call sites.** Wire `injectCdnRuntime` and `commands.ts`. Add I1–I4 tests. Run full suite → all green. Commit.
9. **Commit I — manual exemplar regeneration + visual smoke.** Regenerate the report and manually verify in the browser.

Each commit is small enough to review independently. Each commit either adds failing tests or makes failing tests pass — never both.

## Files To Change

| Step | File | Change |
|---|---|---|
| A | `src/__tests__/collapseAdjacentCitations.test.ts` | **New** — 31 unit tests (Sections A–F) |
| A | `src/vanilla/reportUtils.ts` | Add stub `collapseAdjacentCitations` |
| B | `src/vanilla/reportUtils.ts` | Real implementation |
| C | `src/vanilla/runtime/cdn-bindings.ts` | **New** — extracted from `cdn.ts` |
| C | `src/vanilla/runtime/cdn.ts` | Re-export from `cdn-bindings` |
| D | `src/__tests__/cdnBindTriggers.test.tsx` | **New** — 9 unit tests |
| E | `src/vanilla/runtime/cdn-bindings.ts` | Read `data-dc-extra-keys`, build `entries[]` |
| E | `src/vanilla/runtime/cdn.ts` | `showPopoverFor(trigger, entries[])` signature |
| F | `src/__tests__/cdnPopover.test.tsx` | Add P1–P12 |
| G | `src/vanilla/runtime/cdn.ts` | `CdnPopoverWrapper` accepts `entries[]`, renders tab strip |
| H | `src/vanilla/reportUtils.ts` | Call `collapseAdjacentCitations` inside `injectCdnRuntime` |
| H | `src/cli/commands.ts` | Call `collapseAdjacentCitations` after numeric→hash replacement |
| H | `src/__tests__/reportUtils.test.ts` | Add I1–I3 |
| H | `src/__tests__/cliInject.test.ts` | Add I4 |

**Not changed:**
- `src/cli/markdownToHtml.ts` — leave `wrapCitationMarkers` regex alone. Collapse-at-HTML layer is the fix.
- `src/react/DefaultPopoverContent.tsx` — stays single-citation. The tab strip wraps around it, preserving the current ~700-line component intact and dodging the React-19 fiber-destroy crash risk.

## Reused Utilities (from exploration)

- `mapToCitation`, `mapToVerification` — `src/vanilla/runtime/cdn-mappers.ts` (already a standalone module — easy to import in tests)
- `getStatusFromVerification` — `src/vanilla/runtime/cdn.ts` (may need similar extraction)
- `STATUS_COLORS` — `src/vanilla/runtime/cdn.ts`
- `autoFixDisplayLabels` — `src/vanilla/reportUtils.ts:221` (runs BEFORE `collapseAdjacentCitations` so `data-dc-display-label` is already stamped on the first span of each pair before merging)
- `replaceCitationMarkers` — `src/vanilla/reportUtils.ts:173` (runs BEFORE too)
- `useState`, `useCallback`, `useRef` from React (already imported in `cdn.ts`)
- Existing tab/a11y patterns from `VerificationTabs.test.tsx` (read before writing P7/P10)

## Non-goals

- Generalizing to N-element merging across `<br>`, paragraph breaks, or other block boundaries.
- Detecting and merging citations that share text (not just adjacency).
- Changing how the verifier decides to produce multiple citations per claim — that's a prompt/model decision, not a rendering decision.
- Fixing the underlying `wrapCitationMarkers` regex to avoid emitting empty spans entirely. That's a deeper refactor; the collapse pass is a belt-and-braces fix that also handles cases where the regex gets it right but the verifier genuinely points at two sources for the same claim.

## Verification (end of implementation)

1. `npm test src/__tests__/collapseAdjacentCitations.test.ts` — Layer 1 green (31 tests).
2. `npm test src/__tests__/cdnBindTriggers.test.tsx` — Layer 2 green (9 tests).
3. `npm test src/__tests__/cdnPopover.test.tsx` — Layer 3 green (existing + P1–P12).
4. `npm test src/__tests__/reportUtils.test.ts` — Layer 4 I1–I3 green.
5. `npm test src/__tests__/cliInject.test.ts` — Layer 4 I4 green.
6. `npm test` — full suite green.
7. `npm run check:fix && npm run lint && npm run build` — clean.
8. **Manual exemplar**: re-run verify on `ai-alignment-survey.pdf`; grep regenerated HTML for `<span data-citation-key="[^"]*"></span>` → zero hits. Grep for `data-dc-extra-keys=` → at least two hits.
9. **Manual browser**: load regenerated report → click "AI Alignment" badge → popover opens with `1 / 2` tab strip → click tab 2 → content swaps, no console errors, no popover dismissal.
10. **Manual re-injection**: run the `inject` CLI on the *pre-fix* HTML file and confirm the output now has `data-dc-extra-keys` stamped. Proves the runtime re-injection path (via `injectCdnRuntime`) also fixes pre-existing reports without needing a full re-verify.
