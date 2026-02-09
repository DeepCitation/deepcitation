import type { RenderedOutput, RenderOptions } from "../types.js";

/**
 * Slack-specific citation variant.
 */
export type SlackVariant =
  | "brackets" // <url|[1✓]> — default, clean compact
  | "inline" // <url|Revenue grew 23%✓> — descriptive
  | "number"; // <url|¹✓> — superscript-style

/**
 * Slack-specific render options.
 */
export interface SlackRenderOptions extends RenderOptions {
  /** Slack citation variant (default: "brackets") */
  variant?: SlackVariant;

  /** Maximum message length before truncation (default: 4000) */
  maxMessageLength?: number;
}

/**
 * Slack-specific rendered output.
 */
export interface SlackOutput extends RenderedOutput {
  /** The Slack mrkdwn message (same as content) */
  message: string;
}
