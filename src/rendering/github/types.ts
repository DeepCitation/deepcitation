import type { RenderedOutput, RenderOptions } from "../types.js";

/**
 * GitHub Markdown citation variant.
 */
export type GitHubVariant =
  | "brackets" // [[1✓]](url) — default, standard linked bracket
  | "superscript" // [¹✓](url) — footnote style
  | "inline" // [Revenue grew 23%✓](url) — descriptive
  | "footnote"; // text[^1] + footnote section

/**
 * GitHub sources section format.
 */
export type GitHubSourcesFormat =
  | "table" // Markdown table
  | "list" // Bullet list
  | "detailed"; // Detailed with images and blockquotes

/**
 * GitHub-specific render options.
 */
export interface GitHubRenderOptions extends RenderOptions {
  /** GitHub citation variant (default: "brackets") */
  variant?: GitHubVariant;

  /** Sources section format (default: "table") */
  sourcesFormat?: GitHubSourcesFormat;

  /** Embed proof images in sources section (default: false) */
  includeImages?: boolean;
}

/**
 * GitHub-specific rendered output.
 */
export interface GitHubOutput extends RenderedOutput {
  /** The rendered GitHub Markdown (same as content) */
  markdown: string;
}
