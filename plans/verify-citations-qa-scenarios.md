# Citation Verification QA — Accuracy Scenarios

Targeted test scenarios for improving text match and highlight accuracy in the `/verifyCitations` pipeline. These focus on the API's search/match logic, not the skill's citation-building quality.

## 1. Anchor Text Matching in Dense Prose

### Problem observed
Short anchor text (1-2 words) within long narrative fullPhrases often returns `partial_text_found` — the full phrase is located on the correct page, but the anchor text isn't distinctly matched within it.

### Scenarios

| # | fullPhrase | anchorText | Expected | Why it's hard |
|---|-----------|------------|----------|---------------|
| 1a | "Large left paracentral disc protrusion at L4-5, likely impinging the traversing left L5 nerve root" | "disc protrusion" | found | Common medical term, appears once in phrase |
| 1b | Same as 1a | "L4-5" | found | Short but unique within phrase |
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
| 3c | "fl" (fi ligature) | "fl" (two chars) | Ligature decomposition |
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
