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
export function resolveKeyMap(): void {
  const keyMapEl = document.getElementById("dc-key-map");
  if (!keyMapEl?.textContent) return;
  try {
    const raw: unknown = JSON.parse(keyMapEl.textContent);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return;
    const keyMap = raw as Record<string, unknown>;

    // Legacy path: data-cite → data-citation-key
    const citeEls = document.querySelectorAll<HTMLElement>("[data-cite]");
    for (const el of citeEls) {
      const humanKey = el.getAttribute("data-cite");
      if (!humanKey) continue;
      if (!Object.hasOwn(keyMap, humanKey)) continue;
      const hashedKey = keyMap[humanKey];
      if (typeof hashedKey !== "string") continue;
      el.setAttribute("data-citation-key", hashedKey);
    }

    // Current path: data-citation-key with human-readable value → replace with hashed key
    // Use :not([data-cite]) to exclude legacy elements already resolved above.
    const citationKeyEls = document.querySelectorAll<HTMLElement>("[data-citation-key]:not([data-cite])");
    for (const el of citationKeyEls) {
      const currentKey = el.getAttribute("data-citation-key");
      if (!currentKey) continue;
      if (!Object.hasOwn(keyMap, currentKey)) continue;
      const hashedKey = keyMap[currentKey];
      if (typeof hashedKey !== "string") continue;
      el.setAttribute("data-citation-key", hashedKey);
    }
  } catch {
    console.error("[deepcitation] Failed to parse key map");
  }
}
