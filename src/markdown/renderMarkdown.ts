import { getCitationStatus } from "../parsing/parseCitation.js";
import type { ParsedCitationResult } from "../parsing/parseCitationResponse.js";
import { walkCitationSegments } from "../rendering/shared.js";
import type { Verification } from "../types/verification.js";
import {
  getCitationDisplayText,
  getIndicator,
  renderCitationVariant,
  renderReferencesSection,
} from "./markdownVariants.js";
import type { CitationWithStatus, MarkdownOutput, RenderMarkdownOptions } from "./types.js";

/**
 * Renders LLM output with `[N]` citation markers to clean markdown with verification indicators.
 *
 * Accepts either a raw LLM response string (auto-parsed) or a pre-parsed
 * `ParsedCitationResult` for efficiency when reusing parsed data.
 *
 * @param input - LLM response text or pre-parsed citation result
 * @param options - Rendering options
 * @returns Structured output with markdown, references, and citation metadata
 *
 * @example Basic usage (inline with check indicators)
 * ```typescript
 * const output = renderCitationsAsMarkdown(llmOutput, {
 *   verifications,
 *   variant: "inline",
 *   indicatorStyle: "check",
 * });
 * // output.markdown: "Revenue grew 45%✓ according to the report."
 * // output.full: includes references section if requested
 * ```
 *
 * @example Footnote style with references
 * ```typescript
 * const output = renderCitationsAsMarkdown(llmOutput, {
 *   verifications,
 *   variant: "footnote",
 *   includeReferences: true,
 * });
 * // output.markdown: "Revenue grew 45%[^1] according to the report."
 * // output.references: "[^1]: \"Revenue grew 45%\" - p.3 ✓"
 * ```
 */
export function renderCitationsAsMarkdown(
  input: string | ParsedCitationResult,
  options: RenderMarkdownOptions = {},
): MarkdownOutput {
  const { verifications = {}, includeReferences = false } = options;

  const { segments } = walkCitationSegments(input, verifications);
  const citationsWithStatus: CitationWithStatus[] = [];

  const markdownParts: string[] = [];

  for (const seg of segments) {
    if (seg.type === "text") {
      markdownParts.push(seg.value);
      continue;
    }

    const citationWithStatus: CitationWithStatus = {
      citation: seg.citation,
      citationKey: seg.citationKey,
      verification: seg.verification,
      status: seg.status,
      displayText: getCitationDisplayText(seg.citation, options.variant || "inline"),
      citationNumber: seg.citationNumber,
    };

    citationsWithStatus.push(citationWithStatus);

    markdownParts.push(renderCitationVariant(citationWithStatus, options));
  }

  const markdown = markdownParts.join("");

  // Generate references section if requested
  const references = includeReferences ? renderReferencesSection(citationsWithStatus, options) : undefined;

  // Combine markdown and references for full output
  const full = references ? `${markdown}\n\n---\n\n${references}` : markdown;

  return {
    markdown,
    references,
    full,
    citations: citationsWithStatus,
  };
}

/**
 * Simplified function that returns just the markdown string.
 * Use renderCitationsAsMarkdown() for structured output with metadata.
 *
 * @param input - LLM response text or pre-parsed citation result
 * @param options - Rendering options
 * @returns Rendered markdown string (with references appended if requested)
 *
 * @example
 * ```typescript
 * const md = toMarkdown(llmOutput, {
 *   verifications,
 *   variant: "brackets",
 *   includeReferences: true,
 * });
 * ```
 */
export function toMarkdown(input: string | ParsedCitationResult, options: RenderMarkdownOptions = {}): string {
  return renderCitationsAsMarkdown(input, options).full;
}

/**
 * Get verification indicator for plain text/terminal output.
 * This is a re-export of the existing TUI function for convenience.
 *
 * @param verification - Verification result
 * @param style - Indicator style (default: "check")
 * @returns Indicator character(s)
 */
export function getVerificationIndicator(
  verification: Verification | null | undefined,
  style: import("./types.js").IndicatorStyle = "check",
): string {
  const status = getCitationStatus(verification);
  return getIndicator(status, style);
}
