# Annotate HTML

After building citations and generating keys, annotate the HTML with `data-citation-key` attributes and build a key map for the CDN runtime.

## Place `data-citation-key` attributes

Use human-readable keys from `citations.json` (e.g., `cite-revenue`), NOT hashed keys. The CDN runtime resolves these via the key map.

```html
<!-- Before -->
<div class="stat-value">$2.3B</div>

<!-- After -->
<div class="stat-value" data-citation-key="cite-revenue">$2.3B</div>
```

Write the annotated HTML to `.deepcitation/annotated-{timestamp}.html`.

## Placement rules

Place `data-citation-key` on the most specific element containing the claim:

- **Single value** (e.g. `<span class="stat-value">$2.3B</span>`) → directly on the value element
- **Value + label pair** (e.g. `Revenue: $2.3B`) → on the value element, not the label
- **Compound claim** (e.g. `Revenue grew 45% to $2.3B`) → on the container holding the full claim
- **Table cells** → on the `<td>` containing the verifiable value
- **List items** → on the `<li>` or the inline element wrapping the specific claim
- **Never** on wrapper/layout elements (`<div class="card">`, `<section>`)

The CDN runtime appends a small status indicator icon next to each annotated element, inheriting the element's font size.

## Build the key map

After running `keygen`, build a key-map JSON mapping human-readable keys to hashed keys:

```json
{
  "cite-revenue": "bfd6ec10bd261161",
  "cite-margin": "a3f7b2c1d8e9f012"
}
```

Build this by comparing `citations.json` keys with `citations-keyed.json` keys. Save as `.deepcitation/key-map-{timestamp}.json`.

## Citation drawer trigger

If the HTML has any area that collects sources or references (file listing tabs, "Sources" sections, bibliography areas, document link collections), inject a citation drawer trigger there. If there are multiple such areas, add a trigger to each.

Use your judgement on placement:
- **Bottom of page / footer area**: horizontal drawer trigger opening a bottom drawer
- **Sidebar / navigation area**: side drawer trigger
- **Tab content area** (e.g. "All Files" tab): trigger at top or bottom of the tab content

```html
<div data-dc-drawer-trigger style="margin-top: 1rem;">
  <button type="button" onclick="window.DeepCitationPopover?.showDrawer?.()"
    style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#1a2332;font-size:0.85rem;cursor:pointer;">
    <span style="color:#10b981;">✓</span> View all verification results
  </button>
</div>
```
