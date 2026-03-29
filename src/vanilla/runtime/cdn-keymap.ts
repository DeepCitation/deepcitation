/**
 * Resolves human-readable citation keys to hashed `data-citation-key` values
 * using the key map embedded as `<script id="dc-key-map">{...}</script>`.
 *
 * Handles two attribute formats:
 *  1. `data-cite="cite-revenue"` (legacy) → sets `data-citation-key` to hashed value
 *  2. `data-citation-key="cite-revenue"` (current /verify workflow) → replaces value with hashed key
 *
 * Runs once per init() call (not on update()).
 */
function resolveEls(selector: string, readAttr: string, keyMap: Record<string, unknown>): void {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const humanKey = el.getAttribute(readAttr);
    if (!humanKey) continue;
    const hashedKey = keyMap[humanKey];
    if (typeof hashedKey !== "string") continue;
    el.setAttribute("data-citation-key", hashedKey);
  }
}

export function resolveKeyMap(): void {
  const keyMapEl = document.getElementById("dc-key-map");
  if (!keyMapEl?.textContent) return;
  try {
    const raw: unknown = JSON.parse(keyMapEl.textContent);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
    const keyMap = raw as Record<string, unknown>;

    // Legacy path: data-cite → data-citation-key
    resolveEls("[data-cite]", "data-cite", keyMap);
    // Current path: :not([data-cite]) excludes legacy elements already resolved above
    resolveEls("[data-citation-key]:not([data-cite])", "data-citation-key", keyMap);
  } catch {
    console.error("[deepcitation] Failed to parse key map");
  }
}
