/**
 * CSS for the branded DeepCitation report.
 *
 * Layers on top of the base popover CSS to provide:
 * - Branded header with wordmark
 * - Summary dashboard with status counts
 * - Progressive disclosure (collapsible sections)
 * - Evidence gallery with expand-on-click
 * - Smooth transitions and delight touches
 * - Print-friendly styles
 * - Responsive layout
 */

/** Dark theme uses var() fallbacks to inherit from host --dc-* tokens when available. */
const DARK_VARS = `--dcr-bg: var(--dc-background, #1a1a1e);
  --dcr-surface: var(--dc-muted, #27272a);
  --dcr-surface-raised: #2e2e33;
  --dcr-text: var(--dc-foreground, #fafafa);
  --dcr-text-secondary: var(--dc-muted-foreground, #a1a1aa);
  --dcr-text-tertiary: var(--dc-subtle-foreground, #71717a);
  --dcr-border: var(--dc-border, #3f3f46);
  --dcr-border-subtle: #2e2e33;
  --dcr-shadow: rgba(0,0,0,0.4);
  --dcr-verified-bg: var(--dc-verified-bg, #052e16);
  --dcr-verified-text: var(--dc-verified, #4ade80);
  --dcr-verified-pill: var(--dc-verified-border, #166534);
  --dcr-partial-bg: var(--dc-partial-bg, #451a03);
  --dcr-partial-text: var(--dc-partial, #fbbf24);
  --dcr-partial-pill: var(--dc-partial-border, #92400e);
  --dcr-notfound-bg: var(--dc-destructive-bg, #450a0a);
  --dcr-notfound-text: var(--dc-destructive, #f87171);
  --dcr-notfound-pill: var(--dc-destructive-border, #991b1b);
  --dcr-pending-bg: var(--dc-pending-bg, #27272a);
  --dcr-pending-text: var(--dc-pending, #a1a1aa);
  --dcr-pending-pill: var(--dc-pending-border, #3f3f46);`;

export const BRANDED_REPORT_CSS = `
/* ── Reset & Base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --dcr-bg: var(--dc-background, #ffffff);
  --dcr-surface: var(--dc-muted, #f9fafb);
  --dcr-surface-raised: var(--dc-background, #ffffff);
  --dcr-text: var(--dc-foreground, #18181b);
  --dcr-text-secondary: var(--dc-muted-foreground, #52525b);
  --dcr-text-tertiary: var(--dc-subtle-foreground, #a1a1aa);
  --dcr-border: var(--dc-border, #e4e4e7);
  --dcr-border-subtle: #f4f4f5;
  --dcr-shadow: rgba(0,0,0,0.06);
  --dcr-verified-bg: var(--dc-verified-bg, #f0fdf4);
  --dcr-verified-text: var(--dc-verified, #15803d);
  --dcr-verified-pill: var(--dc-verified-border, #dcfce7);
  --dcr-partial-bg: var(--dc-partial-bg, #fffbeb);
  --dcr-partial-text: var(--dc-partial, #b45309);
  --dcr-partial-pill: var(--dc-partial-border, #fef3c7);
  --dcr-notfound-bg: var(--dc-destructive-bg, #fef2f2);
  --dcr-notfound-text: var(--dc-destructive, #b91c1c);
  --dcr-notfound-pill: var(--dc-destructive-border, #fee2e2);
  --dcr-pending-bg: var(--dc-pending-bg, #f9fafb);
  --dcr-pending-text: var(--dc-pending, #6b7280);
  --dcr-pending-pill: var(--dc-pending-border, #f3f4f6);
  --dcr-font: var(--dc-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif);
  --dcr-font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --dcr-radius: 12px;
  --dcr-radius-sm: 8px;
  --dcr-radius-xs: 6px;
  --dcr-transition: 200ms cubic-bezier(0.2, 0, 0, 1);
  --dcr-expand: 250ms cubic-bezier(0.34, 1.02, 0.64, 1);
}

[data-dc-theme="dark"] { ${DARK_VARS} }
@media (prefers-color-scheme: dark) {
  [data-dc-theme="auto"] { ${DARK_VARS} }
}

body {
  background: var(--dcr-bg);
  color: var(--dcr-text);
  font-family: var(--dcr-font);
  font-size: 16px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

/* ── Layout Shell ── */
.dcr-shell {
  max-width: 860px;
  margin: 0 auto;
  padding: 0 24px 64px;
}

/* ── Branded Header ── */
.dcr-header {
  padding: 32px 0 24px;
  border-bottom: 1px solid var(--dcr-border);
  margin-bottom: 32px;
}

.dcr-wordmark {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.dcr-wordmark svg {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.dcr-wordmark-text {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--dcr-text-secondary);
}

.dcr-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin-top: 16px;
}

.dcr-meta {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 13px;
  color: var(--dcr-text-tertiary);
}

/* ── Summary Dashboard ── */
.dcr-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-bottom: 32px;
}

.dcr-stat {
  background: var(--dcr-surface);
  border: 1px solid var(--dcr-border-subtle);
  border-radius: var(--dcr-radius-sm);
  padding: 16px 20px;
  transition: transform var(--dcr-transition), box-shadow var(--dcr-transition);
}

.dcr-stat:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px var(--dcr-shadow);
}

.dcr-stat-count {
  font-size: 32px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.dcr-stat-label {
  font-size: 13px;
  font-weight: 500;
  margin-top: 4px;
  color: var(--dcr-text-secondary);
}

.dcr-stat-verified .dcr-stat-count { color: var(--dcr-verified-text); }
.dcr-stat-partial .dcr-stat-count { color: var(--dcr-partial-text); }
.dcr-stat-notfound .dcr-stat-count { color: var(--dcr-notfound-text); }
.dcr-stat-total .dcr-stat-count { color: var(--dcr-text); }

/* ── Section (collapsible) ── */
.dcr-section {
  border: 1px solid var(--dcr-border-subtle);
  border-radius: var(--dcr-radius);
  margin-bottom: 16px;
  background: var(--dcr-surface-raised);
  overflow: hidden;
}

.dcr-section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  cursor: pointer;
  user-select: none;
  font-weight: 600;
  font-size: 15px;
  transition: background var(--dcr-transition);
  border: none;
  background: none;
  color: var(--dcr-text);
  width: 100%;
  text-align: left;
  font-family: var(--dcr-font);
}

.dcr-section-header:hover {
  background: var(--dcr-surface);
}

.dcr-section-chevron {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  transition: transform var(--dcr-expand);
  color: var(--dcr-text-tertiary);
}

.dcr-section[open] .dcr-section-chevron {
  transform: rotate(90deg);
}

.dcr-section-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 9999px;
  margin-left: auto;
}

.dcr-badge-verified { background: var(--dcr-verified-pill); color: var(--dcr-verified-text); }
.dcr-badge-partial { background: var(--dcr-partial-pill); color: var(--dcr-partial-text); }
.dcr-badge-notfound { background: var(--dcr-notfound-pill); color: var(--dcr-notfound-text); }
.dcr-badge-pending { background: var(--dcr-pending-pill); color: var(--dcr-pending-text); }

.dcr-section-body {
  padding: 0 20px 16px;
}

/* ── Response Body ── */
.dcr-body {
  padding: 0 0 32px;
  line-height: 1.7;
  font-size: 16px;
}

.dcr-body p {
  margin-bottom: 1em;
}

/* ── Citation Card (in sources list) ── */
.dcr-citation-card {
  display: flex;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--dcr-border-subtle);
  align-items: flex-start;
}

.dcr-citation-card:last-child {
  border-bottom: none;
}

.dcr-citation-num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: var(--dcr-radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.dcr-citation-num-verified { background: var(--dcr-verified-pill); color: var(--dcr-verified-text); }
.dcr-citation-num-partial { background: var(--dcr-partial-pill); color: var(--dcr-partial-text); }
.dcr-citation-num-notfound { background: var(--dcr-notfound-pill); color: var(--dcr-notfound-text); }
.dcr-citation-num-pending { background: var(--dcr-pending-pill); color: var(--dcr-pending-text); }

.dcr-citation-content {
  flex: 1;
  min-width: 0;
}

.dcr-citation-status {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 2px;
}

.dcr-citation-source {
  font-size: 13px;
  color: var(--dcr-text-secondary);
  margin-bottom: 4px;
}

.dcr-citation-quote {
  font-size: 14px;
  font-style: italic;
  color: var(--dcr-text-tertiary);
  border-left: 3px solid var(--dcr-border);
  padding-left: 12px;
  margin-top: 6px;
  line-height: 1.5;
}

/* ── Evidence Thumbnail ── */
.dcr-evidence-thumb {
  width: 80px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--dcr-radius-xs);
  border: 1px solid var(--dcr-border);
  cursor: pointer;
  transition: transform var(--dcr-transition), box-shadow var(--dcr-transition);
  flex-shrink: 0;
}

.dcr-evidence-thumb:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 16px var(--dcr-shadow);
}

/* ── Footer ── */
.dcr-footer {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--dcr-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--dcr-text-tertiary);
}

.dcr-footer a {
  color: var(--dcr-text-secondary);
  text-decoration: none;
}

.dcr-footer a:hover {
  text-decoration: underline;
}

/* ── Empty State ── */
.dcr-empty {
  text-align: center;
  padding: 48px 24px;
  color: var(--dcr-text-tertiary);
}

.dcr-empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

/* ── Animations ── */
@keyframes dcr-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.dcr-animate-in {
  animation: dcr-fade-in 300ms cubic-bezier(0.34, 1.02, 0.64, 1) both;
}

.dcr-stat:nth-child(1) { animation-delay: 0ms; }
.dcr-stat:nth-child(2) { animation-delay: 60ms; }
.dcr-stat:nth-child(3) { animation-delay: 120ms; }
.dcr-stat:nth-child(4) { animation-delay: 180ms; }

/* ── Reduced Motion ── */
@media (prefers-reduced-motion: reduce) {
  .dcr-animate-in { animation: none; }
  .dcr-stat:hover { transform: none; }
  .dcr-evidence-thumb:hover { transform: none; }
  .dcr-section-chevron { transition: none; }
  .dcr-evidence-thumb { transition: none; }
}

/* ── Print ── */
@media print {
  body { background: white; color: black; font-size: 12pt; }
  .dcr-shell { max-width: none; padding: 0; }
  .dcr-stat:hover { transform: none; box-shadow: none; }
  .dcr-section { break-inside: avoid; }
  .dcr-section-chevron { display: none; }
  .dcr-section[open] .dcr-section-body,
  .dcr-section .dcr-section-body { display: block !important; }
  .dcr-evidence-thumb { break-inside: avoid; }
  .dcr-footer { break-before: avoid; }
}

/* ── Responsive ── */
@media (max-width: 640px) {
  .dcr-shell { padding: 0 16px 48px; }
  .dcr-title { font-size: 22px; }
  .dcr-summary { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .dcr-stat { padding: 12px 14px; }
  .dcr-stat-count { font-size: 24px; }
  .dcr-evidence-thumb { width: 60px; height: 42px; }
  .dcr-meta { flex-direction: column; gap: 4px; }
}
`;
