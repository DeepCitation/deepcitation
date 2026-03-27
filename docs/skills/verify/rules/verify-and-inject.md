# Verify and Inject

## Verify citations

The CLI handles grouping by `attachmentId` and merging responses automatically:

```bash
npx -y deepcitation verify --citations .deepcitation/citations-keyed.json
```

Output is saved to `.deepcitation/verify-response.json` by default. Contains verification statuses and evidence images.

Also save the extracted citations as `.deepcitation/citations.json` — the `CitationRecord` (object keyed by citation key, NOT an array).

## Inject into HTML

Use this when you followed Path B — you annotated the HTML with `data-citation-key` attributes and built a key-map.

```bash
npx -y deepcitation inject \
  --html .deepcitation/annotated.html \
  --verify-response .deepcitation/verify-response.json \
  --key-map .deepcitation/key-map.json \
  --out .deepcitation/injected.html
```

The `--key-map` flag embeds a `<script id="dc-key-map">` block that the CDN runtime uses to resolve human-readable `data-citation-key` values to hashed keys at runtime.

This injects before `</body>`:
- Verification JSON (`<script id="dc-data">`)
- The CDN runtime bundle (Preact + React popover components + Tailwind CSS)
- Auto-init script that resolves human-readable `data-citation-key` values to hashed keys via the key map, then wires up click handlers

## Validate before declaring done

Do not tell the user the report is ready until you've checked the resolution chain. Use the timestamped filenames from this run:

1. Count `data-citation-key` elements in the annotated HTML
2. Count key-map entries
3. Count verifications and their statuses (found / partial / not_found)
4. Check for orphans (data-citation-key values with no key-map entry) and missing verifications (key-map entries with no verification result)

If orphans or missing verifications are found, fix them before injecting.

**Then open the result:**
```bash
ls -t .deepcitation/*.html | head -1 | xargs open   # macOS
ls -t .deepcitation/*.html | head -1 | xargs xdg-open  # Linux
```

## Verification status reference

| Status | Display | Meaning |
|--------|---------|---------|
| `found` | ✓ Verified | Exact match in source |
| `partial_text_found` | ⚠ Partial | Full phrase found, anchor text missed |
| `found_anchor_text_only` | ⚠ Partial | Only anchor text matched |
| `found_on_other_page` | ⚠ Partial | Found on different page |
| `not_found` | ✗ Not Found | Could not verify |
