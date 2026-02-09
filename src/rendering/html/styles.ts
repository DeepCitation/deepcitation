import type { HtmlTheme } from "./types.js";

interface StatusColorSet {
  text: string;
  bg: string;
  border: string;
}

interface ThemeColors {
  verified: StatusColorSet;
  partial: StatusColorSet;
  notFound: StatusColorSet;
  pending: StatusColorSet;
}

/**
 * Status colors for citation indicators.
 */
const STATUS_COLORS: { light: ThemeColors; dark: ThemeColors } = {
  light: {
    verified: { text: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
    partial: { text: "#d97706", bg: "#fffbeb", border: "#fde68a" },
    notFound: { text: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    pending: { text: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
  },
  dark: {
    verified: { text: "#4ade80", bg: "#052e16", border: "#166534" },
    partial: { text: "#fbbf24", bg: "#451a03", border: "#92400e" },
    notFound: { text: "#f87171", bg: "#450a0a", border: "#991b1b" },
    pending: { text: "#9ca3af", bg: "#1f2937", border: "#374151" },
  },
};

/**
 * Linter underline styles mapping status to CSS text-decoration.
 */
const LINTER_UNDERLINE_STYLES = {
  verified: "solid",
  partial: "dashed",
  notFound: "wavy",
  pending: "dotted",
} as const;

/**
 * Generate the full CSS style block for citation rendering.
 */
export function generateStyleBlock(prefix: string, theme: HtmlTheme): string {
  const generateThemeStyles = (colors: ThemeColors, selector: string) => `
${selector} .${prefix}citation {
  position: relative;
  cursor: pointer;
  text-decoration: none;
}

${selector} .${prefix}citation-link {
  text-decoration: none;
  color: inherit;
}

${selector} .${prefix}citation-link:hover {
  opacity: 0.8;
}

${selector} .${prefix}verified .${prefix}indicator {
  color: ${colors.verified.text};
}

${selector} .${prefix}partial .${prefix}indicator {
  color: ${colors.partial.text};
}

${selector} .${prefix}not-found .${prefix}indicator {
  color: ${colors.notFound.text};
}

${selector} .${prefix}pending .${prefix}indicator {
  color: ${colors.pending.text};
}

/* Tooltip styles */
${selector} .${prefix}tooltip {
  display: none;
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.85em;
  line-height: 1.4;
  white-space: nowrap;
  z-index: 1000;
  pointer-events: none;
  max-width: 320px;
}

${selector} .${prefix}citation:hover .${prefix}tooltip {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

${selector} .${prefix}verified .${prefix}tooltip {
  background: ${colors.verified.bg};
  border: 1px solid ${colors.verified.border};
  color: ${colors.verified.text};
}

${selector} .${prefix}partial .${prefix}tooltip {
  background: ${colors.partial.bg};
  border: 1px solid ${colors.partial.border};
  color: ${colors.partial.text};
}

${selector} .${prefix}not-found .${prefix}tooltip {
  background: ${colors.notFound.bg};
  border: 1px solid ${colors.notFound.border};
  color: ${colors.notFound.text};
}

${selector} .${prefix}pending .${prefix}tooltip {
  background: ${colors.pending.bg};
  border: 1px solid ${colors.pending.border};
  color: ${colors.pending.text};
}

${selector} .${prefix}tooltip-status {
  font-weight: 600;
}

${selector} .${prefix}tooltip-source {
  font-size: 0.9em;
  opacity: 0.85;
}

${selector} .${prefix}tooltip-quote {
  font-style: italic;
  font-size: 0.9em;
  opacity: 0.75;
  white-space: normal;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
}

${selector} .${prefix}tooltip-image {
  max-width: 280px;
  border-radius: 4px;
  margin-top: 4px;
}

/* Linter variant */
${selector} .${prefix}linter.${prefix}verified {
  text-decoration: underline ${LINTER_UNDERLINE_STYLES.verified} ${colors.verified.text};
  text-underline-offset: 2px;
}

${selector} .${prefix}linter.${prefix}partial {
  text-decoration: underline ${LINTER_UNDERLINE_STYLES.partial} ${colors.partial.text};
  text-underline-offset: 2px;
}

${selector} .${prefix}linter.${prefix}not-found {
  text-decoration: underline ${LINTER_UNDERLINE_STYLES.notFound} ${colors.notFound.text};
  text-underline-offset: 2px;
}

${selector} .${prefix}linter.${prefix}pending {
  text-decoration: underline ${LINTER_UNDERLINE_STYLES.pending} ${colors.pending.text};
  text-underline-offset: 2px;
}

/* Chip variant */
${selector} .${prefix}chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 9999px;
  font-size: 0.85em;
}

${selector} .${prefix}chip.${prefix}verified {
  background: ${colors.verified.bg};
  border: 1px solid ${colors.verified.border};
}

${selector} .${prefix}chip.${prefix}partial {
  background: ${colors.partial.bg};
  border: 1px solid ${colors.partial.border};
}

${selector} .${prefix}chip.${prefix}not-found {
  background: ${colors.notFound.bg};
  border: 1px solid ${colors.notFound.border};
}

${selector} .${prefix}chip.${prefix}pending {
  background: ${colors.pending.bg};
  border: 1px solid ${colors.pending.border};
}`;

  if (theme === "auto") {
    return `<style>
${generateThemeStyles(STATUS_COLORS.light, "")}

@media (prefers-color-scheme: dark) {
${generateThemeStyles(STATUS_COLORS.dark, "")}
}
</style>`;
  }

  const colors = theme === "dark" ? STATUS_COLORS.dark : STATUS_COLORS.light;
  return `<style>
${generateThemeStyles(colors, "")}
</style>`;
}

/**
 * Get inline style string for a citation based on status and variant.
 * Used when inlineStyles is true (for email).
 */
export function getInlineStyle(
  statusKey: "verified" | "partial" | "notFound" | "pending",
  variant: string,
  theme: HtmlTheme,
): string {
  const colors = (theme === "dark" ? STATUS_COLORS.dark : STATUS_COLORS.light)[statusKey];

  const base = `cursor: pointer; text-decoration: none;`;

  if (variant === "linter") {
    const underlineStyle = LINTER_UNDERLINE_STYLES[statusKey];
    return `${base} text-decoration: underline ${underlineStyle} ${colors.text}; text-underline-offset: 2px;`;
  }

  if (variant === "chip") {
    return `${base} display: inline-flex; align-items: center; gap: 2px; padding: 1px 6px; border-radius: 9999px; font-size: 0.85em; background: ${colors.bg}; border: 1px solid ${colors.border};`;
  }

  return base;
}

/**
 * Get inline style for the indicator span.
 */
export function getIndicatorInlineStyle(
  statusKey: "verified" | "partial" | "notFound" | "pending",
  theme: HtmlTheme,
): string {
  const colors = (theme === "dark" ? STATUS_COLORS.dark : STATUS_COLORS.light)[statusKey];
  return `color: ${colors.text};`;
}
