import { formatPageLocation, getIndicator } from "../../markdown/markdownVariants.js";
import type { ParsedCitationResult } from "../../parsing/parseCitationResponse.js";
import type { CitationStatus } from "../../types/citation.js";
import { resolveSourceLabel, walkCitationSegments } from "../shared.js";
import { bold, colorize, dim, horizontalRule, shouldUseColor } from "./ansiColors.js";
import type { TerminalOutput, TerminalRenderOptions, TerminalVariant } from "./types.js";

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
 * Render LLM output with `[N]` citation markers for terminal/CLI output with ANSI colors.
 *
 * Accepts either a raw LLM response string (auto-parsed) or a pre-parsed
 * `ParsedCitationResult` for efficiency when reusing parsed data.
 *
 * @example
 * ```typescript
 * import { renderCitationsForTerminal } from "deepcitation/terminal";
 *
 * const output = renderCitationsForTerminal(llmOutput, {
 *   verifications,
 *   variant: "brackets",
 *   color: true,
 *   includeSources: true,
 * });
 * ```
 */
export function renderCitationsForTerminal(
  input: string | ParsedCitationResult,
  options: TerminalRenderOptions = {},
): TerminalOutput {
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
  const { segments, citationsWithStatus } = walkCitationSegments(input, verifications);

  const coloredParts: string[] = [];
  const plainParts: string[] = [];

  for (const seg of segments) {
    if (seg.type === "text") {
      coloredParts.push(seg.value);
      plainParts.push(seg.value);
      continue;
    }

    const rendered = renderTerminalCitation(
      seg.citationNumber,
      seg.citation.anchorText ?? undefined,
      seg.status,
      indicatorStyle,
      variant,
      useColor,
    );

    coloredParts.push(rendered.colored);
    plainParts.push(rendered.plain);
  }

  const coloredText = coloredParts.join("");
  const plainText = plainParts.join("");

  // Build sources section
  let sources: string | undefined;
  if (includeSources && citationsWithStatus.length > 0) {
    const sourceLines: string[] = [];
    sourceLines.push(horizontalRule("Sources", maxWidth, useColor));

    for (const cws of citationsWithStatus) {
      const label = resolveSourceLabel(cws, sourceLabels);
      const location = formatPageLocation(cws.citation, cws.verification, {
        showPageNumber: true,
        showLinePosition: false,
      });
      const indicator = getIndicator(cws.status, indicatorStyle as import("../../markdown/types.js").IndicatorStyle);
      const statusKey = getStatusKey(cws.status);

      const marker = colorize(`[${cws.citationNumber}]`, statusKey, useColor);
      const coloredIndicator = colorize(indicator, statusKey, useColor);
      const loc = location ? ` — ${location}` : "";
      sourceLines.push(` ${marker} ${coloredIndicator} ${label}${loc}`);

      if (cws.citation.fullPhrase) {
        const quote =
          cws.citation.fullPhrase.length > maxWidth - 10
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

  return {
    content: coloredText,
    text: coloredText,
    plain: plainText,
    sources,
    full: coloredFull,
    citations: citationsWithStatus,
  };
}
