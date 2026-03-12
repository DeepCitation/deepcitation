/**
 * CSS for the vanilla popover runtime.
 * Self-contained — no Tailwind dependency.
 */
export const POPOVER_CSS = `
/* ── Popover container ── */
.dc-popover {
  position: fixed;
  z-index: 10000;
  width: 340px;
  max-width: calc(100vw - 16px);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15), 0 1px 4px rgba(0, 0, 0, 0.1);
  overflow: clip;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  background: var(--dc-pop-bg, #fff);
  color: var(--dc-pop-text, #1f2937);
  border: 1px solid var(--dc-pop-border, #e5e7eb);
}

.dc-pop-content {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Status header ── */
.dc-pop-header {
  padding: 8px 12px;
  font-weight: 600;
  font-size: 13px;
  border-bottom: 1px solid var(--dc-pop-border, #e5e7eb);
}

.dc-pop-verified {
  background: var(--dc-pop-verified-bg, #f0fdf4);
  color: var(--dc-pop-verified-text, #16a34a);
}

.dc-pop-partial {
  background: var(--dc-pop-partial-bg, #fffbeb);
  color: var(--dc-pop-partial-text, #d97706);
}

.dc-pop-not-found {
  background: var(--dc-pop-notfound-bg, #fef2f2);
  color: var(--dc-pop-notfound-text, #dc2626);
}

.dc-pop-pending {
  background: var(--dc-pop-pending-bg, #f9fafb);
  color: var(--dc-pop-pending-text, #6b7280);
}

/* ── Source label ── */
.dc-pop-source {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--dc-pop-muted, #6b7280);
  border-bottom: 1px solid var(--dc-pop-border, #e5e7eb);
}

/* ── Quote blockquote ── */
.dc-pop-quote {
  margin: 8px 12px;
  padding: 8px 12px;
  font-style: italic;
  font-size: 13px;
  color: var(--dc-pop-muted, #6b7280);
  border-left: 3px solid var(--dc-pop-border, #e5e7eb);
}

/* ── Evidence image ── */
.dc-pop-image {
  display: block;
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-top: 1px solid var(--dc-pop-border, #e5e7eb);
  background: var(--dc-pop-image-bg, #f9fafb);
}

/* ── Expanded image overlay ── */
.dc-pop-expanded-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 24px;
}

.dc-pop-expanded-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}

/* ── Dark theme via custom properties ── */
[data-dc-theme="dark"] {
  --dc-pop-bg: #1f2937;
  --dc-pop-text: #f9fafb;
  --dc-pop-border: #374151;
  --dc-pop-muted: #9ca3af;
  --dc-pop-image-bg: #111827;
  --dc-pop-verified-bg: #052e16;
  --dc-pop-verified-text: #4ade80;
  --dc-pop-partial-bg: #451a03;
  --dc-pop-partial-text: #fbbf24;
  --dc-pop-notfound-bg: #450a0a;
  --dc-pop-notfound-text: #f87171;
  --dc-pop-pending-bg: #1f2937;
  --dc-pop-pending-text: #9ca3af;
}

/* ── Auto theme (follow system) ── */
@media (prefers-color-scheme: dark) {
  [data-dc-theme="auto"] {
    --dc-pop-bg: #1f2937;
    --dc-pop-text: #f9fafb;
    --dc-pop-border: #374151;
    --dc-pop-muted: #9ca3af;
    --dc-pop-image-bg: #111827;
    --dc-pop-verified-bg: #052e16;
    --dc-pop-verified-text: #4ade80;
    --dc-pop-partial-bg: #451a03;
    --dc-pop-partial-text: #fbbf24;
    --dc-pop-notfound-bg: #450a0a;
    --dc-pop-notfound-text: #f87171;
    --dc-pop-pending-bg: #1f2937;
    --dc-pop-pending-text: #9ca3af;
  }
}

/* ── Base document styles for full-page reports ── */
.dc-report {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.7;
  color: var(--dc-pop-text, #1f2937);
}
`;
