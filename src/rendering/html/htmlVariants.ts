import { getIndicator, toSuperscript } from "../../markdown/markdownVariants.js";
import type { IndicatorStyle } from "../../markdown/types.js";
import type { CitationStatus } from "../../types/citation.js";
import { getIndicatorInlineStyle, getInlineStyle } from "./styles.js";
import type { HtmlTheme, HtmlVariant } from "./types.js";

/**
 * Map a CitationStatus to a status key for CSS classes and inline styles.
 */
export function getStatusKey(status: CitationStatus): "verified" | "partial" | "notFound" | "pending" {
  if (status.isMiss) return "notFound";
  if (status.isPartialMatch) return "partial";
  if (status.isVerified) return "verified";
  return "pending";
}

/**
 * Get the CSS class name for a status.
 */
function getStatusClass(status: CitationStatus, prefix: string): string {
  const key = getStatusKey(status);
  const classMap: Record<string, string> = {
    verified: `${prefix}verified`,
    partial: `${prefix}partial`,
    notFound: `${prefix}not-found`,
    pending: `${prefix}pending`,
  };
  return classMap[key];
}

/**
 * Get a human-readable status label.
 */
function getStatusLabel(status: CitationStatus): string {
  if (status.isMiss) return "Not Found";
  if (status.isPartialMatch) return "Partial Match";
  if (status.isVerified) return "Verified";
  return "Pending";
}

interface HtmlCitationOptions {
  citationNumber: number;
  anchorText: string | undefined;
  status: CitationStatus;
  indicatorStyle: IndicatorStyle;
  proofUrl: string | undefined;
  variant: HtmlVariant;
  prefix: string;
  inlineStyles: boolean;
  includeTooltips: boolean;
  theme: HtmlTheme;
  citationKey: string;
  sourceLabel?: string;
  location?: string;
  quote?: string;
  imageUrl?: string;
}

/**
 * Render a citation as an HTML fragment.
 */
export function renderHtmlCitation(opts: HtmlCitationOptions): string {
  const {
    citationNumber,
    anchorText,
    status,
    indicatorStyle,
    proofUrl,
    variant,
    prefix,
    inlineStyles,
    includeTooltips,
    theme,
    citationKey,
    sourceLabel,
    location,
    quote,
    imageUrl,
  } = opts;

  const indicator = getIndicator(status, indicatorStyle);
  const statusKey = getStatusKey(status);
  const statusCls = getStatusClass(status, prefix);
  const statusLabel = getStatusLabel(status);

  // Build the display text
  let displayText: string;
  let variantClass = "";

  switch (variant) {
    case "linter":
      displayText = anchorText || `Citation ${citationNumber}`;
      variantClass = `${prefix}linter`;
      break;
    case "chip":
      displayText = anchorText || `Citation ${citationNumber}`;
      variantClass = `${prefix}chip`;
      break;
    case "superscript":
      displayText = toSuperscript(citationNumber);
      break;
    default:
      displayText = `[${citationNumber}`;
      break;
  }

  // Build style attributes
  const spanStyle = inlineStyles ? ` style="${getInlineStyle(statusKey, variant, theme)}"` : "";
  const indicatorSpanStyle = inlineStyles ? ` style="${getIndicatorInlineStyle(statusKey, theme)}"` : "";

  // Build the inner content
  let inner: string;
  if (variant === "brackets") {
    inner = `<span class="${prefix}citation-text">${displayText}</span><span class="${prefix}indicator"${indicatorSpanStyle}>${indicator}</span><span class="${prefix}citation-text">]</span>`;
  } else if (variant === "linter") {
    inner = `<span class="${prefix}citation-text">${displayText}</span>`;
  } else {
    inner = `<span class="${prefix}citation-text">${displayText}</span><span class="${prefix}indicator"${indicatorSpanStyle}>${indicator}</span>`;
  }

  // Wrap in link if proofUrl provided
  if (proofUrl) {
    inner = `<a href="${escapeHtmlAttr(proofUrl)}" target="_blank" rel="noopener" class="${prefix}citation-link">${inner}</a>`;
  }

  // Add tooltip
  if (includeTooltips) {
    const tooltipParts: string[] = [`<span class="${prefix}tooltip-status">${indicator} ${statusLabel}</span>`];
    if (sourceLabel) {
      const loc = location ? ` — ${escapeHtml(location)}` : "";
      tooltipParts.push(`<span class="${prefix}tooltip-source">${escapeHtml(sourceLabel)}${loc}</span>`);
    }
    if (quote) {
      const truncated = quote.length > 100 ? `${quote.slice(0, 100)}...` : quote;
      tooltipParts.push(`<span class="${prefix}tooltip-quote">"${escapeHtml(truncated)}"</span>`);
    }
    if (imageUrl) {
      tooltipParts.push(
        `<img class="${prefix}tooltip-image" src="${escapeHtmlAttr(imageUrl)}" alt="Proof snippet" loading="lazy" />`,
      );
    }
    inner += `<span class="${prefix}tooltip">${tooltipParts.join("")}</span>`;
  }

  const classes = [`${prefix}citation`, statusCls, variantClass].filter(Boolean).join(" ");

  return `<span class="${classes}"${spanStyle} data-citation-key="${escapeHtmlAttr(citationKey)}"${proofUrl ? ` data-proof-url="${escapeHtmlAttr(proofUrl)}"` : ""}>${inner}</span>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeHtmlAttr(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
