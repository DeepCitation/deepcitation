"""
Tests for review_extract.py — specifically the §7 false-positive patterns that
were bugs in the original embedded extraction script.

Each test is named after the §7 pattern it covers and documents:
  - The exact HTML structure that caused the false positive
  - The expected behaviour after the fix

These serve as regression tests: if the extraction logic is ever refactored,
these tests must still pass.
"""

import sys
import os

# Allow importing the script from the parent scripts/ directory.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from review_extract import extract_citations, _normalize_quotes, _strip_tags


# ── Helpers ───────────────────────────────────────────────────────────────────

KEY = "aabbccdd11223344"  # 16-char hex, the format the extractor expects


def _minimal_cit(n: int, anchor: str, full_phrase: str = "", status: str = "found") -> dict:
    """Build a minimal citation data entry as the script expects."""
    return {
        "citation": {
            "citationNumber": n,
            "anchorText": anchor,
            "fullPhrase": full_phrase,
        },
        "status": status,
    }


def _result_for(html: str, n: int = 1, anchor: str = "label", full_phrase: str = "", status: str = "found") -> dict:
    cit_data = {KEY: _minimal_cit(n, anchor, full_phrase, status)}
    results = extract_citations(html, cit_data)
    assert len(results) == 1, f"Expected 1 result, got {len(results)}: {results}"
    return results[0]


def _new_format_cit(n: int, anchor: str, full_phrase: str = "", status: str = "found") -> dict:
    """Build a citation entry using the post-#977 field names (sourceMatch/sourceContext)."""
    return {
        "citation": {
            "citationNumber": n,
            "sourceMatch": anchor,
            "sourceContext": full_phrase,
        },
        "status": status,
    }


# ── Pattern 3: List-item PLACEMENT false positives ────────────────────────────

class TestListItemPlacementFP:
    """
    §7 Pattern 3: In bullet-list reports, the citation span IS the list item
    content — nothing precedes it inside the <li>.  The old extraction script
    saw pre = "<li>" (raw HTML) and checked whether the display label appeared
    in that string, which it never did, producing a spurious PLACEMENT flag.

    Fix: strip HTML tags from both display and pre before comparison.
    """

    def test_citation_as_sole_li_content_does_not_flag_placement(self):
        """Span is the entire <li> content — pre-context is just '<li>'."""
        html = (
            '<ul>'
            f'<li><span data-dc-display-label="transferable" data-citation-key="{KEY}">transferable</span></li>'
            '</ul>'
        )
        result = _result_for(html, anchor="transferable", full_phrase="transferable")
        assert "PLACEMENT" not in result["issues"], (
            f"Expected no PLACEMENT flag for list-item-only span, got issues={result['issues']}"
        )

    def test_citation_as_li_content_with_trailing_text_does_not_flag_placement(self):
        """Span is at the start of <li> content with trailing text."""
        html = (
            '<ul>'
            f'<li><span data-dc-display-label="transferable" data-citation-key="{KEY}">transferable</span> rights</li>'
            '</ul>'
        )
        result = _result_for(html, anchor="transferable", full_phrase="transferable rights")
        assert "PLACEMENT" not in result["issues"]

    def test_real_placement_violation_in_li_still_flags(self):
        """Marker placed BEFORE the noun inside a list item IS a real violation."""
        # "The [N] Discount Rate" pattern inside a list item — label 'Rate' doesn't precede span
        html = (
            '<ul>'
            f'<li>The <span data-dc-display-label="Discount Rate" data-citation-key="{KEY}">Rate</span> was 5%</li>'
            '</ul>'
        )
        result = _result_for(html, anchor="Discount Rate", full_phrase="Discount Rate was 5%")
        # "Discount Rate" does NOT appear before the span in plain text ("The " only) → PLACEMENT
        assert "PLACEMENT" in result["issues"]


# ── Pattern 4: Bold-text PLACEMENT false positives ───────────────────────────

class TestBoldTextPlacementFP:
    """
    §7 Pattern 4: When **bold text** [N] markdown is processed via inlineFormat
    Strategy 2c, it produces <span data-cite="N"><strong>label</strong></span>.
    The old script extracted inner = '<strong>label</strong>' (with HTML tags)
    as the display label, then searched for that HTML-tagged string in the
    pre-context prose — which only contains plain text — and never found it.

    Fix: strip HTML tags from display before the placement comparison.
    """

    def test_bold_span_preceding_prose_does_not_flag_placement(self):
        """Pre-context contains 'interest rate' as plain text; span wraps <strong>."""
        html = (
            '<p>The interest rate is '
            f'<span data-dc-display-label="interest rate" data-citation-key="{KEY}">'
            '<strong>interest rate</strong>'
            '</span> per the agreement.</p>'
        )
        result = _result_for(html, anchor="interest rate", full_phrase="interest rate per the agreement")
        assert "PLACEMENT" not in result["issues"], (
            f"Expected no PLACEMENT for bold span with label in pre-context, got issues={result['issues']}"
        )

    def test_bold_span_without_label_in_pre_does_flag_placement(self):
        """Bold span where the label genuinely doesn't appear before it."""
        html = (
            '<p>The '
            f'<span data-dc-display-label="Discount Rate" data-citation-key="{KEY}">'
            '<strong>Discount Rate</strong>'
            '</span> was 5%.</p>'
        )
        result = _result_for(html, anchor="Discount Rate", full_phrase="Discount Rate was 5%")
        # "Discount Rate" not in "The " → real PLACEMENT violation
        assert "PLACEMENT" in result["issues"]

    def test_strip_tags_helper(self):
        assert _strip_tags("<strong>hello</strong>") == "hello"
        assert _strip_tags("<li><span>text</span></li>") == "text"
        assert _strip_tags("plain text") == "plain text"


# ── Pattern 5: Smart-quote NOT_SUBSTRING false positives ─────────────────────

class TestSmartQuoteNotSubstringFP:
    """
    §7 Pattern 5: PDF OCR frequently produces curly/smart quotes (\u201c \u201d)
    while LLM-generated anchors use plain ASCII " and '.  A byte-exact substring
    check returns False even though the text is semantically identical.

    Fix: normalise both anchor and fullPhrase to ASCII quotes before comparing.
    """

    def test_curly_double_quotes_in_full_phrase_not_flagged(self):
        anchor = '"fair market value"'
        full_phrase = "\u201cfair market value\u201d as defined in Schedule A"
        html = f'<p><span data-citation-key="{KEY}">{anchor}</span></p>'
        result = _result_for(html, anchor=anchor, full_phrase=full_phrase)
        assert "NOT_SUBSTRING" not in result["issues"], (
            f"Expected no NOT_SUBSTRING for curly-quote mismatch, got issues={result['issues']}"
        )

    def test_curly_single_quotes_in_full_phrase_not_flagged(self):
        anchor = "it's transferable"
        full_phrase = "it\u2019s transferable under the agreement"
        html = f'<p><span data-citation-key="{KEY}">{anchor}</span></p>'
        result = _result_for(html, anchor=anchor, full_phrase=full_phrase)
        assert "NOT_SUBSTRING" not in result["issues"]

    def test_genuinely_non_verbatim_anchor_still_flags(self):
        """'not transferable' is not a substring of 'Neither X nor Y are transferable'."""
        anchor = "not transferable"
        full_phrase = "Neither interests nor rights are transferable without consent"
        html = f'<p><span data-citation-key="{KEY}">{anchor}</span></p>'
        result = _result_for(html, anchor=anchor, full_phrase=full_phrase)
        assert "NOT_SUBSTRING" in result["issues"]

    def test_normalize_quotes_helper(self):
        assert _normalize_quotes("\u201chello\u201d") == '"hello"'
        assert _normalize_quotes("it\u2019s") == "it's"
        assert _normalize_quotes("plain") == "plain"


# ── Regression: #977 field rename (anchorText→sourceMatch, fullPhrase→sourceContext) ──

class TestFieldNameRename:
    """
    Regression for commit #977 which renamed anchorText→sourceMatch and
    fullPhrase→sourceContext in the citation data format.

    review_extract.py must read both old and new field names so that:
      - HTML produced before #977  (anchorText/fullPhrase) still grades correctly
      - HTML produced after #977   (sourceMatch/sourceContext) still grades correctly
    """

    def test_new_field_names_read_anchor_correctly(self):
        """sourceMatch must be used as the anchor, not fall back to empty string."""
        anchor = "alignment cycle"
        full_phrase = "The alignment cycle consists of forward and backward phases"
        html = f'<p>The alignment cycle is <span data-citation-key="{KEY}">{anchor}</span>.</p>'
        cit_data = {KEY: _new_format_cit(1, anchor, full_phrase)}
        results = extract_citations(html, cit_data)
        assert len(results) == 1
        r = results[0]
        assert r["anchor"] == anchor, f"Expected anchor '{anchor}', got '{r['anchor']}'"
        assert r["anchor_words"] == 2, f"Expected 2 words, got {r['anchor_words']}"

    def test_new_field_names_substring_check_works(self):
        """is_substring must be computed from sourceMatch ⊆ sourceContext, not return None."""
        anchor = "alignment cycle"
        full_phrase = "The alignment cycle consists of forward and backward phases"
        html = f'<p>The alignment cycle is <span data-citation-key="{KEY}">{anchor}</span>.</p>'
        cit_data = {KEY: _new_format_cit(1, anchor, full_phrase)}
        results = extract_citations(html, cit_data)
        r = results[0]
        assert r["is_substring"] is True, f"Expected is_substring=True, got {r['is_substring']}"
        assert "NOT_SUBSTRING" not in r["issues"]

    def test_new_field_names_long_anchor_detected(self):
        """LONG_ANCHOR must fire on a 6-word sourceMatch, not silently pass."""
        anchor = "behave in line with human intentions"  # 6 words
        full_phrase = "AI systems behave in line with human intentions and values"
        html = f'<p>AI systems <span data-citation-key="{KEY}">{anchor}</span>.</p>'
        cit_data = {KEY: _new_format_cit(1, anchor, full_phrase)}
        results = extract_citations(html, cit_data)
        r = results[0]
        assert r["anchor_words"] == 6, f"Expected 6 words, got {r['anchor_words']}"
        assert "LONG_ANCHOR" in r["issues"]

    def test_old_field_names_still_work(self):
        """Backward compat: HTML from before #977 (anchorText/fullPhrase) must still grade."""
        anchor = "alignment cycle"
        full_phrase = "The alignment cycle consists of forward and backward phases"
        html = f'<p>The alignment cycle is <span data-citation-key="{KEY}">{anchor}</span>.</p>'
        # Use old-format helper (anchorText/fullPhrase)
        cit_data = {KEY: _minimal_cit(1, anchor, full_phrase)}
        results = extract_citations(html, cit_data)
        r = results[0]
        assert r["anchor"] == anchor
        assert r["is_substring"] is True

    def test_new_field_names_placement_ok(self):
        """PLACEMENT must not fire when claimText precedes the span with new-format citations."""
        anchor = "alignment cycle"
        full_phrase = "The alignment cycle consists of forward and backward phases"
        html = (
            f'<p>The alignment cycle is '
            f'<span data-dc-display-label="{anchor}" data-citation-key="{KEY}">{anchor}</span>.</p>'
        )
        cit_data = {KEY: _new_format_cit(1, anchor, full_phrase)}
        results = extract_citations(html, cit_data)
        assert len(results) == 1
        r = results[0]
        assert "PLACEMENT" not in r["issues"], (
            f"Expected no PLACEMENT for new-format citation with preceding claimText, got issues={r['issues']}"
        )


# ── Sanity: unfixed patterns remain correctly handled ────────────────────────

class TestUnchangedBehavior:
    """Verify that the fixes do not accidentally suppress real issues."""

    def test_not_found_status_flags_not_found(self):
        html = f'<p><span data-citation-key="{KEY}">revenue</span></p>'
        result = _result_for(html, anchor="revenue", full_phrase="total revenue grew", status="not_found")
        assert "NOT_FOUND" in result["issues"]

    def test_long_anchor_flags(self):
        anchor = "revenue grew significantly in the quarter"  # 7 words
        html = f'<p>Revenue: <span data-citation-key="{KEY}">{anchor}</span></p>'
        result = _result_for(html, anchor=anchor, full_phrase=anchor)
        assert "LONG_ANCHOR" in result["issues"]

    def test_ellipsis_flags(self):
        anchor = "revenue...grew"
        html = f'<p>Some text <span data-citation-key="{KEY}">{anchor}</span> here</p>'
        result = _result_for(html, anchor=anchor, full_phrase="revenue grew in Q3")
        assert "ELLIPSIS" in result["issues"]

    def test_clean_citation_has_no_issues(self):
        # For placement_ok=True the display label must appear BEFORE the span in prose.
        # Format: "...claimText... <span data-dc-display-label='claimText'>sourceMatch</span>..."
        anchor = "independent appraiser"  # sourceMatch — inside span
        full_phrase = "determined by an independent appraiser retained by the board"
        claim = "fair market value"
        # data-citation-key must precede data-dc-display-label to match the regex.
        html = (
            f'<p>The {claim} was determined by '
            f'<span data-citation-key="{KEY}" data-dc-display-label="{claim}">'
            f'{anchor}</span>.</p>'
        )
        # display = claim ("fair market value"), pre = "The fair market value was determined by "
        # → "fair market value" IS in pre → placement_ok = True
        result = _result_for(html, anchor=anchor, full_phrase=full_phrase)
        assert result["issues"] == [], f"Expected no issues, got {result['issues']}"
