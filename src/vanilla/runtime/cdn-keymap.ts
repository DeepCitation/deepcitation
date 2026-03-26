/**
 * Resolves human-readable `data-cite` attributes to hashed `data-citation-key`
 * using the key map embedded as `<script id="dc-key-map">{...}</script>`.
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
    const citeEls = document.querySelectorAll<HTMLElement>("[data-cite]");
    for (const el of citeEls) {
      const humanKey = el.getAttribute("data-cite");
      if (!humanKey) continue;
      if (!Object.hasOwn(keyMap, humanKey)) continue;
      const hashedKey = keyMap[humanKey];
      if (typeof hashedKey !== "string") continue;
      el.setAttribute("data-citation-key", hashedKey);
    }
  } catch {
    console.error("[deepcitation] Failed to parse key map");
  }
}
