# Citation Verification QA — Accuracy Scenarios

Targeted test scenarios for improving text match and highlight accuracy in the `/verifyCitations` pipeline. These focus on the API's search/match logic, not the skill's citation-building quality.

## 1. Anchor Text Matching in Dense Prose

### Problem observed
Short anchor text (1-2 words) within long narrative fullPhrases often returns `partial_text_found` — the full phrase is located on the correct page, but the anchor text isn't distinctly matched within it.

### Scenarios

| # | fullPhrase | anchorText | Expected | Why it's hard |
|---|-----------|------------|----------|---------------|
| 1a | "Large left paracentral disc protrusion at L4-5, likely impinging the traversing left L5 nerve root" | "disc protrusion" | found | Common medical term, appears once in phrase |
| 1b | Same as 1a | "L4-5" | found | Short but unique on the page (identifiers can be short; the 5+ word rule applies when the anchor appears in multiple contexts) |
| 1c | Same as 1a | "Large left paracentral disc protrusion" | found | Long, distinctive — should be easy |
| 1d | "The patient was seen in consultation for evaluation of right lower limb pain" | "pain" | partial? | Single word, appears in many contexts |
| 1e | "WBC (BẠCH CẦU) 5.71 G/L 3.9 - 10" | "5.71" | found | Numeric value in structured line |
| 1f | "Định lượng HbA1c 5.5 % 4.0 - 6.0" | "HbA1c 5.5" | found | Two tokens, distinctive |

### What to measure
- Does the API's anchor-text search use substring match, token match, or fuzzy match?
- What is the minimum anchor text length (in characters/tokens) for reliable `found` status?
- Does anchor text position within the fullPhrase matter (beginning vs middle vs end)?

## 2. Multi-line fullPhrase Degradation

### Problem observed
When fullPhrase spans multiple `<line>` tags in the deepTextPromptPortion, verification often degrades to `partial_text_found` even when each individual line matches perfectly.

### Scenarios

| # | Setup | Expected | Actual (observed) |
|---|-------|----------|-------------------|
| 2a | fullPhrase = single tagged line | found | found |
| 2b | fullPhrase = tagged line + untagged continuation | found or partial? | partial_text_found |
| 2c | fullPhrase = two tagged lines concatenated | found or partial? | partial_text_found |
| 2d | fullPhrase = tagged line + reference range from next line | partial | partial_text_found |

### Questions
- Does the search join adjacent lines before matching, or match line-by-line?
- Would the API benefit from a "multi-line fullPhrase" mode that searches across line boundaries?
- Should the skill be instructed to always use single-line fullPhrase, or should the API handle multi-line better?

## 3. OCR Artifacts and Special Characters

### Problem observed
Scanned documents produce OCR text with curly quotes, ligatures, superscript-as-ordinal, and encoding variations that cause anchor text mismatches.

### Scenarios

| # | Source text (OCR) | fullPhrase provided | Issue |
|---|------------------|-------------------|-------|
| 3a | "patient\u2019s" (curly apostrophe) | "patient's" (straight) | Quote normalization |
| 3b | "70th percentile" (superscript "th") | "70th percentile" | Superscript flattening |
| 3c | "ﬂ" (U+FB02 fl ligature) | "fl" (two ASCII chars) | Ligature decomposition |
| 3d | "5.5\u00a0%" (non-breaking space) | "5.5 %" (regular space) | Whitespace normalization |
| 3e | "résumé" (accented) | "resume" (unaccented) | Diacritic stripping — should NOT match |

### Questions
- Does the API normalize quotes/whitespace before matching?
- Should it? (Yes for 3a-3d, No for 3e — diacritics change meaning)
- What normalization steps are applied today?

## 4. Evidence Image Highlight Accuracy

### Problem observed
The evidence image sometimes highlights the wrong region when there are duplicate values on the same page (e.g., "5.5" appears in both HbA1c and another test).

### Scenarios

| # | Setup | Expected highlight | Risk |
|---|-------|--------------------|------|
| 4a | "HbA1c 5.5" on page with glucose "5.99" | Highlight HbA1c row only | OK — values are different |
| 4b | "ALT 22" on page with AST "22" | Highlight ALT row only | Both have "22" |
| 4c | Two tables on same page, both with header "Result" | Highlight correct table | Header text duplicated |
| 4d | "Normal" status appears 8 times on page | Highlight the one near the cited value | Many duplicates |

### Questions
- Does the highlight use the fullPhrase context to disambiguate, or just anchorText position?
- When anchorText appears multiple times on a page, how is the correct instance selected?
- Does lineId help disambiguate highlight position?

## 5. Cross-Page and Page Boundary Cases

### Scenarios

| # | Setup | Expected |
|---|-------|----------|
| 5a | Claim on page 3, lineId points to page 3 | found |
| 5b | Claim on page 3, lineId points to page 2 (wrong page, right text) | found_on_other_page |
| 5c | Claim text spans page break (starts page 2, ends page 3) | ? |
| 5d | lineId doesn't exist in deepTextPromptPortion | Falls back to page search → partial |
| 5e | pageNumber is correct but lineId is for a different page | ? |

### Questions
- What is the search order? (exact line → same page → other pages → give up?)
- How does the API handle text that crosses page boundaries?

## 6. Structured vs Unstructured Text

### Problem observed
Lab value tables verify at ~95% exact match. Narrative prose verifies at ~65%. The gap suggests the search logic is optimized for structured text.

### Scenarios to quantify the gap

| Type | Example | Expected hit rate |
|------|---------|-------------------|
| Lab table row | "WBC 5.71 G/L 3.9 - 10" | >95% |
| Key-value pair | "Date of Birth: 24/10/1983" | >90% |
| Medication entry | "Concerta 36mg methylphenidate" | >85% |
| Clinical finding (1 sentence) | "Mild scoliosis with convexity to the left" | >80% |
| Clinical finding (multi-sentence) | "Large left paracentral disc protrusion at L4-5, likely impinging the traversing left L5 nerve root. There is also..." | >60% |
| Free-form narrative | "The patient reports intermittent sharp pain radiating from the lower back down the left posterior thigh" | >50% |

### Recommendation
If the gap is inherent to the search algorithm, document expected accuracy by content type so skill authors set appropriate expectations. If it's fixable, consider:
- N-gram search for narrative text
- Sliding window match that tolerates minor whitespace/punctuation differences
- Confidence score in the response so callers know how strong the match is

## 7. Duplicate/Near-Duplicate Citations

### Scenarios

| # | Setup | Risk |
|---|-------|------|
| 7a | Two citations with same fullPhrase but different anchorText | Both should return found, different highlights |
| 7b | Two citations with same anchorText but different fullPhrase | Both should match independently |
| 7c | Same claim cited from two different attachments | Both should verify against their respective sources |
| 7d | Citation key collision (different content, same hash) | Should be impossible with SHA-1, but worth testing |

## 8. Edge Cases

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| 8a | Empty fullPhrase | Reject with validation error |
| 8b | fullPhrase longer than 500 characters | Should still work (truncate search?) |
| 8c | anchorText not present in fullPhrase | Should return partial at best |
| 8d | anchorText === fullPhrase | Should return found (degenerate case) |
| 8e | Unicode RTL text (Arabic/Hebrew) | Should match correctly |
| 8f | Mixed CJK + Latin text | Should match correctly |
| 8g | Tab and newline characters in fullPhrase | Should normalize to spaces |

## Priority Matrix

| Priority | Scenarios | Impact |
|----------|-----------|--------|
| P0 — Blocks adoption | 2 (multi-line), 6 (structured vs narrative gap) | Directly affects hit rate |
| P1 — Improves accuracy | 1 (anchor text length), 3 (OCR artifacts), 4 (highlight accuracy) | Reduces partial matches |
| P2 — Edge hardening | 5 (cross-page), 7 (duplicates), 8 (edge cases) | Prevents silent failures |

## Suggested Test Harness

Build a test fixture with known-good source documents (the QA test corpus from `scratch/skill/`) and a citation matrix covering all scenarios above. Run the full matrix on each API deploy and track:

- **Exact match rate** by content type
- **Partial rate** by anchor text length
- **Regression detection** when search logic changes

The fixture should include:
- Vietnamese blood work PDF (structured, non-English)
- English psych assessment PDF (narrative, scanned)
- MRI report (dense medical prose)
- Simple 1-page test PDF (for isolated scenario testing)

---

## 9. Legal URL Verification — End-to-End Test Suite

Tests that mirror how lawyers, compliance officers, and legal researchers actually use the tool. Each test simulates a real conversation flow, then appends `/verify` to validate the output.

### Source URLs

| # | URL | Type |
|---|-----|------|
| 9a | `https://www.law.cornell.edu/supct/html/12-307.ZO.html` | Supreme Court opinion (Shelby County v. Holder) |
| 9b | `https://www.law.cornell.edu/uscode/text/42/chapter-21/subchapter-I-A` | Federal statute (Voting Rights Act §2) |
| 9c | `https://www.ecfr.gov/current/title-29/subtitle-B/chapter-XIV/part-1630` | Federal regulation (ADA employment regs) |
| 9d | `https://www.law.cornell.edu/supct/html/08-205.ZO.html` | Supreme Court opinion (Citizens United v. FEC) |
| 9e | `https://www.law.cornell.edu/supct/html/14-556.ZO.html` | Supreme Court opinion (Obergefell v. Hodges) |

### Test Scenarios

#### Test 9a — "Chat first, verify after" (most common flow)

A user has a conversation about voting rights, then asks to verify the AI's claims after the fact.

**Chat turn 1** (user): "I'm preparing a brief on Section 5 preclearance. What did the Supreme Court decide in Shelby County v. Holder, and which provisions of the Voting Rights Act were affected?"

**Chat turn 2** (AI responds with analysis — no citations yet)

**Chat turn 3** (user): `/verify`

The skill should:
1. Find the uncited AI response in conversation history (Step 0, Path C)
2. Identify the source URL from the context (Shelby County opinion)
3. Prepare the URL, re-generate with citations, verify, inject

**Expected**: Citations on the 5-4 split, Section 4(b), Section 5, Chief Justice Roberts, 15th Amendment. All `found`.

**Playwright**: Click citation on "Section 4(b)" → screenshot popover showing ✓ with opinion text. Save to `scratch/legal-qa/9a-shelby-section4b.png`.

#### Test 9b — "Report with implied sources" (user expects the AI to find them)

User asks for a report and names legal concepts, not URLs. The AI must identify and prepare the right sources.

**Chat turn 1** (user): "Write me a memo on how the Voting Rights Act Section 2 'totality of circumstances' test works, with the current statutory text and any relevant case law. /verify"

The skill should:
1. Recognize this needs source documents (Step 0, Path A/C hybrid)
2. The AI knows the VRA §2 text lives at Cornell LII — prepare that URL
3. Generate the memo with citations against the prepared source
4. Verify and inject

**Expected**: Citations on "No voting qualification or prerequisite to voting...", §2(a), §2(b), "totality of circumstances". Verbatim statutory text → `found`. Long multi-clause sentences → possible `partial_text_found`.

**Playwright**: Click citation on "totality of circumstances" → screenshot popover showing context from §2(b). Save to `scratch/legal-qa/9b-vra-totality.png`.

#### Test 9c — "Definitions lookup" (structured regulatory content)

User asks a direct question about regulations, expects precise section references.

**Chat turn 1** (user): "I need the exact ADA definitions of 'disability', 'qualified individual', and 'reasonable accommodation' from 29 CFR 1630 for an employment discrimination filing."

**Chat turn 2** (AI responds with definitions and section numbers)

**Chat turn 3** (user): `/verify`

The skill should:
1. Find the uncited definitions in conversation history
2. Prepare the eCFR URL for 29 CFR 1630
3. Re-generate with citations, verify, inject

**Expected**: §1630.2(g), §1630.2(m), §1630.2(o) definitions all cited. Regulatory text is highly structured → all `found`.

**Playwright**: Click citation on "disability" definition → screenshot popover showing §1630.2(g) text. Save to `scratch/legal-qa/9c-ada-disability.png`.

#### Test 9d — Hallucination detection (fabricated case in user's prompt)

User's own prompt contains a hallucinated case. The system must flag it.

**Chat turn 1** (user): "I'm writing a First Amendment brief. Compare Citizens United v. FEC with Henderson v. United States Department of Commerce (2015), which extended corporate speech protections to nonprofit advocacy organizations. Give me the key holdings from both. /verify"

**Note**: "Henderson v. United States Department of Commerce (2015)" is fabricated. The AI should:
- Prepare the Citizens United opinion URL and cite real holdings → `found`
- Either decline to cite Henderson (no source exists) or produce citations that verify as ✗

**Expected**: Real Citizens United claims → `found`. Henderson claims → `not_found` or absent entirely. Zero false ✓ on fabricated content.

**Playwright**: If any Henderson citation exists, click it → screenshot popover showing ✗. Save to `scratch/legal-qa/9d-hallucination-henderson.png`. This screenshot is the most important artifact — it proves the system surfaces fabricated citations rather than hiding them.

#### Test 9e — "Multi-source comparative analysis" (two real opinions)

User asks the AI to compare two real cases, requiring citations from both sources.

**Chat turn 1** (user): "Compare how the Court's reasoning about the 14th Amendment differs between Obergefell v. Hodges and Shelby County v. Holder. Focus on Due Process and Equal Protection. /verify"

The skill should:
1. Prepare both opinion URLs (two separate `attachmentId` values)
2. Generate analysis with citations spanning both sources
3. Each citation's `attachmentId` must match its source

**Expected**: Due Process and Equal Protection citations from Obergefell → `found`. 15th Amendment / Section 5 citations from Shelby County → `found`. Cross-source attribution is correct (no mixing up which opinion a quote came from).

**Playwright**: Click a citation from each source — one Obergefell, one Shelby County — screenshot both popovers to confirm different source URLs appear. Save to `scratch/legal-qa/9e-obergefell-dueprocess.png` and `scratch/legal-qa/9e-shelby-15th.png`.

### Execution

For each test, an operator (or automated runner) starts a Claude Code conversation and follows the chat turns above. After `/verify` completes:

1. Check `.deepcitation/verify-response.json` — compare statuses against expectations
2. Serve the output HTML: `npx -y http-server .deepcitation -p 8765`
3. Use Playwright to navigate, click citations, and capture screenshots:
   - Navigate to the output HTML
   - Click each `[data-verification]` element
   - Wait for popover to render
   - Screenshot to `scratch/legal-qa/{test-id}-{description}.png`

### Success Criteria

| Metric | Target |
|--------|--------|
| Real claims → `found` | ≥80% |
| Real claims → `partial_text_found` | ≤15% |
| Real claims → `not_found` | ≤5% |
| Hallucinated claims → `not_found` or absent | 100% |
| Popover renders with status icon | All screenshots |
| Cross-source attribution correct (9e) | No mixed-up attachmentIds |
| No false ✓ on fabricated content | Zero tolerance |

### Why These Flows

- **9a** (chat → verify): The most common user flow. Tests Path C (uncited AI content → re-generate with citations).
- **9b** (inline /verify): Tests the skill's ability to identify sources from context, not just explicit file paths.
- **9c** (structured regulatory): Tests high-accuracy verification against well-structured content.
- **9d** (hallucination): The key differentiator — proves the system catches fabricated citations.
- **9e** (multi-source): Tests correct `attachmentId` attribution across multiple prepared sources.
