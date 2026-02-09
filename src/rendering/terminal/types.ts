import type { RenderedOutput, RenderOptions } from "../types.js";

/**
 * Terminal citation variant.
 */
export type TerminalVariant =
  | "brackets" // [1✓] with ANSI color — default
  | "inline" // Revenue grew 23%✓ with colored indicator
  | "minimal"; // Just the indicator ✓

/**
 * Terminal-specific render options.
 */
export interface TerminalRenderOptions extends RenderOptions {
  /** Terminal citation variant (default: "brackets") */
  variant?: TerminalVariant;

  /** Enable ANSI colors (auto-detects NO_COLOR env var) (default: true) */
  color?: boolean;

  /** Maximum output width for truncation (default: 80) */
  maxWidth?: number;
}

/**
 * Terminal-specific rendered output.
 */
export interface TerminalOutput extends RenderedOutput {
  /** ANSI-colored text (same as content) */
  text: string;

  /** Plain text without ANSI codes (for logging) */
  plain: string;
}
