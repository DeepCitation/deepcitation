import { getCitationStatus } from "../../parsing/parseCitation.js";
import { generateCitationKey } from "../../react/utils.js";
import { getIndicator, formatPageLocation } from "../../markdown/markdownVariants.js";
import type { CitationStatus } from "../../types/citation.js";
import { parseCiteAttributes, buildCitationFromAttrs } from "../citationParser.js";
import type { RenderCitationWithStatus } from "../types.js";
import { shouldUseColor, colorize, bold, dim, stripAnsi, horizontalRule } from "./ansiColors.js";
import type { TerminalOutput, TerminalRenderOptions, TerminalVariant } from "./types.js";

/**
 * Module-level compiled regex for cite tag matching.
 */
const CITE_TAG_REGEX = /<cite\s+[^>]*?\/>/g;

/**
 * Map CitationStatus to a status key for color mapping.
 */
function getStatusKey(status: CitationStatus): "verified" | "partial" | "notFound" | "pending" {
  if (status.isMiss) return "notFound";
  if (status.isPartialMatch) return "partial";
  if (status.isVerified) return "verified";
  return "pending";
}

/**
 * Get a human-readable status label.
 */
function getStatusLabel(status: CitationStatus): string {
  if (status.isMiss) return "Not Found";
  if (status.isPartialMatch) return "Partial";
  if (status.isVerified) return "Verified";
  return "Pending";
}

/**
 * Render a single citation for terminal output.
 */
function renderTerminalCitation(
  citationNumber: number,
  anchorText: string | undefined,
  status: CitationStatus,
  indicatorStyle: string,
  variant: TerminalVariant,
  useColor: boolean,
): { colored: string; plain: string } {
  const indicator = getIndicator(status, indicatorStyle as import("../../markdown/types.js").IndicatorStyle);
  const statusKey = getStatusKey(status);

  let plainText: string;
  switch (variant) {
    case "inline":
      plainText = `${anchorText || `Citation ${citationNumber}`}${indicator}`;
      break;
    case "minimal":
      plainText = indicator;
      break;
    case "brackets":
    default:
      plainText = `[${citationNumber}${indicator}]`;
      break;
  }

  return {
    colored: colorize(plainText, statusKey, useColor),
    plain: plainText,
  };
}

/**
 * Render LLM output with <cite /> tags for terminal/CLI output with ANSI colors.
 *
 * @example
 * ```typescript
 * import { renderCitationsForTerminal } from "@deepcitation/deepcitation-js/terminal";
 *
 * const output = renderCitationsForTerminal(llmOutput, {
 *   verifications,
 *   variant: "brackets",
 *   color: true,
 *   includeSources: true,
 * });
 * // output.text: "Revenue grew 23%. \x1b[32m[1✓]\x1b[0m"
 * // output.plain: "Revenue grew 23%. [1✓]"
 * ```
 */
export function renderCitationsForTerminal(input: string, options: TerminalRenderOptions = {}): TerminalOutput {
  const {
    verifications = {},
    indicatorStyle = "check",
    includeSources = false,
    sourceLabels = {},
    variant = "brackets",
    color,
    maxWidth = 80,
  } = options;

  const useColor = shouldUseColor(color);
  const citationsWithStatus: RenderCitationWithStatus[] = [];
  let citationIndex = 0;

  const citationRegex = new RegExp(CITE_TAG_REGEX.source, CITE_TAG_REGEX.flags);

  let coloredText = input;
  let plainText = input;

  // We need to replace in both colored and plain versions.
  // Do a single pass to collect replacements, then apply them.
  const replacements: Array<{ original: string; colored: string; plain: string }> = [];

  const matches = input.match(citationRegex);
  if (matches) {
    for (const match of matches) {
      citationIndex++;
      const attrs = parseCiteAttributes(match);
      const citation = buildCitationFromAttrs(attrs, citationIndex);
      const citationKey = generateCitationKey(citation);
      const verification = verifications[citationKey] || null;
      const status = getCitationStatus(verification);

      citationsWithStatus.push({
        citation,
        citationKey,
        verification,
        status,
        citationNumber: citationIndex,
      });

      const rendered = renderTerminalCitation(
        citationIndex,
        citation.anchorText ?? undefined,
        status,
        indicatorStyle,
        variant,
        useColor,
      );

      replacements.push({ original: match, colored: rendered.colored, plain: rendered.plain });
    }
  }

  // Apply replacements (one at a time to handle duplicates correctly)
  for (const r of replacements) {
    coloredText = coloredText.replace(r.original, r.colored);
    plainText = plainText.replace(r.original, r.plain);
  }

  // Build sources section
  let sources: string | undefined;
  if (includeSources && citationsWithStatus.length > 0) {
    const sourceLines: string[] = [];
    sourceLines.push(horizontalRule("Sources", maxWidth, useColor));

    for (const cws of citationsWithStatus) {
      const label =
        sourceLabels[cws.citation.attachmentId || ""] ||
        cws.verification?.label ||
        cws.citation.title ||
        `Source ${cws.citationNumber}`;
      const location = formatPageLocation(cws.citation, cws.verification, { showPageNumber: true, showLinePosition: false });
      const indicator = getIndicator(cws.status, indicatorStyle as import("../../markdown/types.js").IndicatorStyle);
      const statusKey = getStatusKey(cws.status);
      const statusLabel = getStatusLabel(cws.status);

      const marker = colorize(`[${cws.citationNumber}]`, statusKey, useColor);
      const coloredIndicator = colorize(indicator, statusKey, useColor);
      const loc = location ? ` — ${location}` : "";
      sourceLines.push(` ${marker} ${coloredIndicator} ${label}${loc}`);

      if (cws.citation.fullPhrase) {
        const quote = cws.citation.fullPhrase.length > maxWidth - 10
          ? `${cws.citation.fullPhrase.slice(0, maxWidth - 13)}...`
          : cws.citation.fullPhrase;
        sourceLines.push(`     ${dim(`"${quote}"`, useColor)}`);
      }
    }

    const bottomRule = "─".repeat(maxWidth);
    sourceLines.push(useColor ? bold(bottomRule, true) : bottomRule);
    sources = sourceLines.join("\n");
  }

  const coloredFull = sources ? `${coloredText}\n\n${sources}` : coloredText;
  const plainFull = sources ? `${plainText}\n\n${stripAnsi(sources)}` : plainText;

  return {
    content: coloredText,
    text: coloredText,
    plain: plainText,
    sources,
    full: coloredFull,
    citations: citationsWithStatus,
  };
}
