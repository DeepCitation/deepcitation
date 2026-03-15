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
import type { CitationWithStatus, IndicatorStyle, MarkdownOutput, RenderMarkdownOptions } from "./types.js";

/** Render LLM output with `[N]` markers to markdown with verification indicators. */
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

/** Returns just the markdown string. Use `renderCitationsAsMarkdown()` for structured output. */
export function toMarkdown(input: string | ParsedCitationResult, options: RenderMarkdownOptions = {}): string {
  return renderCitationsAsMarkdown(input, options).full;
}

/** Get verification indicator character(s) for plain text/terminal output. */
export function getVerificationIndicator(
  verification: Verification | null | undefined,
  style: IndicatorStyle = "check",
): string {
  const status = getCitationStatus(verification);
  return getIndicator(status, style);
}
