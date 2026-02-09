import type { RenderedOutput, RenderOptions } from "../types.js";

/**
 * HTML citation variant.
 */
export type HtmlVariant =
  | "linter" // Underlined text spans with semantic colors
  | "brackets" // [1✓] with tooltip — default
  | "chip" // Pill badge with background
  | "superscript"; // ¹✓ small raised style

/**
 * Theme for HTML output.
 */
export type HtmlTheme = "light" | "dark" | "auto";

/**
 * HTML-specific render options.
 */
export interface HtmlRenderOptions extends RenderOptions {
  /** HTML citation variant (default: "brackets") */
  variant?: HtmlVariant;

  /** Embed <style> block in output (default: true) */
  includeStyles?: boolean;

  /** Use inline style="" attributes instead of classes (for email) (default: false) */
  inlineStyles?: boolean;

  /** Include CSS hover tooltips (default: true) */
  includeTooltips?: boolean;

  /** Color theme (default: "light") */
  theme?: HtmlTheme;

  /** CSS class prefix (default: "dc-") */
  classPrefix?: string;
}

/**
 * HTML-specific rendered output.
 */
export interface HtmlOutput extends RenderedOutput {
  /** The rendered HTML fragment (same as content) */
  html: string;

  /** The <style> block (if includeStyles is true) */
  styles?: string;
}
