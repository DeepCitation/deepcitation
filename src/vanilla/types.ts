import type { IndicatorStyle } from "../markdown/types.js";
import type { HtmlTheme, HtmlVariant } from "../rendering/html/types.js";
import type { VerificationRecord } from "../types/citation.js";

/**
 * Options for `renderCitationReport()`.
 */
export interface VanillaReportOptions {
  /** Verification results keyed by citationKey */
  verifications?: VerificationRecord;

  /** Citation display variant (default: "brackets") */
  variant?: HtmlVariant;

  /** Color theme (default: "auto") */
  theme?: HtmlTheme;

  /** HTML document <title> (default: "Citation Report") */
  title?: string;

  /** Wrap output in <!DOCTYPE html> (default: true) */
  fullPage?: boolean;

  /** Embed <style> block (default: true) */
  includeStyles?: boolean;

  /** Embed popover <script> (default: true) */
  includeRuntime?: boolean;

  /** Indicator symbol set (default: "check") */
  indicatorStyle?: IndicatorStyle;

  /** CSS class prefix (default: "dc-") */
  classPrefix?: string;

  /** Base URL for proof links */
  proofBaseUrl?: string;

  /** Attachment ID → display name mapping */
  sourceLabels?: Record<string, string>;
}
