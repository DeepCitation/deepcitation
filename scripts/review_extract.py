"""
review_extract.py — Citation extraction and grading for /review-verify.

Parses a *-verified.html file produced by `deepcitation verify --html`,
extracts citation data from the inline script tag and body spans, then
grades each citation against the QA rules in deep-citation-standards.md.

Usage (standalone):
    python3 review_extract.py <path-to-verified.html>

Importable API (for tests):
    from review_extract import extract_citations, parse_cit_data, parse_span_map
"""

import json
import os
import re
import sys
from html import unescape


# ── Quote normalisation ───────────────────────────────────────────────────────

def _normalize_quotes(s: str) -> str:
    """Replace curly/smart quotes with ASCII equivalents for substring matching.

    PDF OCR frequently produces Unicode curly quotes (\u201c, \u201d, \u2018,
    \u2019) while LLM-generated anchors use plain ASCII " and '.  A byte-exact
    substring check fails even though the text is semantically identical.  This
    normaliser is applied to BOTH strings before comparison so the check is
    quote-style-agnostic.
    """
    return (
        s.replace("\u201c", '"')
         .replace("\u201d", '"')
         .replace("\u2018", "'")
         .replace("\u2019", "'")
    )


# ── HTML tag stripping ────────────────────────────────────────────────────────

def _strip_tags(s: str) -> str:
    """Remove all HTML tags from a string, leaving only text content."""
    return re.sub(r"<[^>]+>", "", s)


# ── Parsing helpers ───────────────────────────────────────────────────────────

def parse_cit_data(html: str) -> dict:
    """Extract the citation data object from the first <script> tag in html."""
    script_m = re.search(r"<script[^>]*>(.*?)</script>", html, re.DOTALL)
    raw = script_m.group(1).strip() if script_m else "{}"
    try:
        return json.loads(raw)
    except Exception:
        obj_m = re.search(r'(\{"[a-f0-9]{16}".*\})', raw, re.DOTALL)
        return json.loads(obj_m.group(1)) if obj_m else {}


def parse_span_map(html: str) -> dict:
    """Build a map from citation key → span metadata (display label, placement).

    Placement rule: the display label text (HTML-stripped) must appear somewhere
    in the 120 characters of plain text BEFORE the span.  This catches the common
    error of `The [N] Discount Rate` where the marker precedes the noun.

    False-positive guards applied here:
      - Strip HTML tags from both `display` and `pre` before comparison so that
        bold-text spans (`<strong>label</strong>`) and list-item contexts (`<li>`)
        do not trigger false PLACEMENT flags.
    """
    span_map = {}
    for m in re.finditer(
        r'(.{0,120})<span[^>]+data-citation-key="([a-f0-9]{16})"'
        r'(?:[^>]*data-dc-display-label="([^"]*)")?[^>]*>(.*?)</span>(.{0,80})',
        html,
        re.DOTALL,
    ):
        pre, key, attr_label, inner, post = m.groups()
        display = unescape(attr_label or inner or "")

        # Strip HTML tags from both sides before placement check (fixes bold-text
        # false positives where inner = '<strong>label</strong>' — see §7 pattern 4).
        display_text = _strip_tags(display)
        pre_text = _strip_tags(unescape(pre))

        # Empty pre_text means the span starts the visible content (e.g. it IS
        # the list-item content).  There is no preceding prose to misplace the
        # marker in, so PLACEMENT cannot fire — see §7 pattern 3.
        if not pre_text.strip():
            label_in_pre = True
        else:
            label_in_pre = bool(display_text and display_text.lower() in pre_text.lower())

        span_map.setdefault(
            key,
            {
                "displayLabel": display,
                "pre_context": unescape(pre[-100:]),
                "post_context": unescape(post[:80]),
                "placement_ok": label_in_pre,
            },
        )
    return span_map


# ── Core grading ──────────────────────────────────────────────────────────────

def extract_citations(html: str, cit_data: dict | None = None) -> list[dict]:
    """Grade every citation in cit_data against the QA rules.

    Args:
        html:     Full HTML content of the verified report.
        cit_data: Pre-parsed citation data dict (key → citation object).
                  If None, parsed from the <script> tag in html.

    Returns:
        List of result dicts, one per citation, sorted by citationNumber.
        Each dict contains: n, key, status, anchor, anchor_words,
        full_phrase_snippet, display_label, display_words, is_substring,
        has_ellipsis, placement_ok, issues, pre_context.
    """
    if cit_data is None:
        cit_data = parse_cit_data(html)

    span_map = parse_span_map(html)
    results = []

    for key, cit in cit_data.items():
        c = cit.get("citation", {})
        anchor = c.get("anchorText", "")
        full_phrase = c.get("fullPhrase", "")
        status = cit.get("status", "unknown")
        n = c.get("citationNumber", "?")
        span = span_map.get(key, {})
        display = span.get("displayLabel") or anchor

        anchor_words = len(anchor.split())
        display_words = len(display.split())

        # Quote-normalised substring check (fixes smart-quote false positives —
        # see §7 pattern 5).
        if full_phrase and anchor:
            is_substring = _normalize_quotes(anchor.lower()) in _normalize_quotes(
                full_phrase.lower()
            )
        else:
            is_substring = None

        has_ellipsis = "..." in anchor
        placement_ok = span.get("placement_ok")

        issues = []
        if status == "not_found":
            issues.append("NOT_FOUND")
        elif status == "partial":
            issues.append("PARTIAL")
        if anchor_words > 4:
            issues.append("LONG_ANCHOR")
        if is_substring is False:
            issues.append("NOT_SUBSTRING")
        if has_ellipsis:
            issues.append("ELLIPSIS")
        if display_words > 4:
            issues.append("LONG_LABEL")
        if placement_ok is False:
            issues.append("PLACEMENT")

        results.append(
            {
                "n": n,
                "key": key[:8],
                "status": status,
                "anchor": anchor,
                "anchor_words": anchor_words,
                "full_phrase_snippet": full_phrase[:80] if full_phrase else "",
                "display_label": display,
                "display_words": display_words,
                "is_substring": is_substring,
                "has_ellipsis": has_ellipsis,
                "placement_ok": placement_ok,
                "issues": issues,
                "pre_context": span.get("pre_context", ""),
            }
        )

    results.sort(key=lambda r: r["n"] if isinstance(r["n"], int) else 999)
    return results


# ── CLI entry point ───────────────────────────────────────────────────────────

def main(path: str) -> None:
    content = open(path, encoding="utf-8").read()
    results = extract_citations(content)

    os.makedirs(".deepcitation", exist_ok=True)
    basename = os.path.splitext(os.path.basename(path))[0]
    out = f".deepcitation/review-{basename}.json"
    with open(out, "w") as f:
        json.dump(results, f, indent=2)

    print(f"Extracted {len(results)} citations → {out}")
    for r in results:
        flag = "  " if not r["issues"] else "! "
        print(f"{flag}[{r['n']:>2}] {r['status']:<9} {r['anchor_words']}w  {r['anchor'][:60]}")
        if r["issues"]:
            print(f"       ^ {', '.join(r['issues'])}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 review_extract.py <path-to-verified.html>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1])
