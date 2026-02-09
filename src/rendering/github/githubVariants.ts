import { getIndicator, toSuperscript } from "../../markdown/markdownVariants.js";
import type { IndicatorStyle } from "../../markdown/types.js";
import type { CitationStatus } from "../../types/citation.js";
import type { GitHubVariant } from "./types.js";

/**
 * Render a citation marker in GitHub Markdown format.
 */
export function renderGitHubCitation(
  citationNumber: number,
  anchorText: string | undefined,
  status: CitationStatus,
  indicatorStyle: IndicatorStyle,
  proofUrl: string | undefined,
  variant: GitHubVariant,
): string {
  const indicator = getIndicator(status, indicatorStyle);

  switch (variant) {
    case "footnote":
      return `[^${citationNumber}]`;

    case "superscript": {
      const sup = toSuperscript(citationNumber);
      const text = `${sup}${indicator}`;
      return proofUrl ? `[${text}](${proofUrl})` : text;
    }

    case "inline": {
      const text = `${anchorText || `Citation ${citationNumber}`}${indicator}`;
      return proofUrl ? `[${text}](${proofUrl})` : text;
    }

    default: {
      const text = `[${citationNumber}${indicator}]`;
      return proofUrl ? `[${text}](${proofUrl})` : text;
    }
  }
}

/**
 * Get a status label for table/list display.
 */
export function getStatusLabel(status: CitationStatus): string {
  if (status.isMiss) return "Not Found";
  if (status.isPartialMatch) return "Partial";
  if (status.isVerified) return "Verified";
  if (status.isPending) return "Pending";
  return "Unknown";
}

/**
 * Render sources as a Markdown table inside <details>.
 */
export function renderGitHubSourcesTable(
  entries: Array<{
    citationNumber: number;
    indicator: string;
    statusLabel: string;
    sourceLabel: string;
    location: string;
    proofUrl?: string;
  }>,
): string {
  const lines: string[] = [
    "<details>",
    `<summary><b>Sources (${entries.length})</b></summary>`,
    "<br>",
    "",
    "| # | Status | Source | Location | Proof |",
    "|---|--------|--------|----------|-------|",
  ];

  for (const entry of entries) {
    const proofLink = entry.proofUrl ? `[View proof](${entry.proofUrl})` : "—";
    lines.push(
      `| ${entry.citationNumber} | ${entry.indicator} ${entry.statusLabel} | ${entry.sourceLabel} | ${entry.location || "—"} | ${proofLink} |`,
    );
  }

  lines.push("", "</details>");
  return lines.join("\n");
}

/**
 * Render sources as a bullet list inside <details>.
 */
export function renderGitHubSourcesList(
  entries: Array<{
    citationNumber: number;
    indicator: string;
    statusLabel: string;
    sourceLabel: string;
    location: string;
    proofUrl?: string;
  }>,
): string {
  const lines: string[] = ["<details>", `<summary><b>Sources (${entries.length})</b></summary>`, "<br>", ""];

  for (const entry of entries) {
    const proofLink = entry.proofUrl ? ` — [View proof](${entry.proofUrl})` : "";
    const location = entry.location ? ` — ${entry.location}` : "";
    lines.push(`- **[${entry.citationNumber}]** ${entry.indicator} ${entry.sourceLabel}${location}${proofLink}`);
  }

  lines.push("", "</details>");
  return lines.join("\n");
}

/**
 * Render sources in detailed format with images and blockquotes inside <details>.
 */
export function renderGitHubSourcesDetailed(
  entries: Array<{
    citationNumber: number;
    indicator: string;
    statusLabel: string;
    sourceLabel: string;
    location: string;
    quote?: string;
    proofUrl?: string;
    imageUrl?: string;
  }>,
): string {
  const lines: string[] = ["<details>", `<summary><b>Sources (${entries.length})</b></summary>`, "<br>", ""];

  for (const entry of entries) {
    lines.push(
      `**[${entry.citationNumber}${entry.indicator}] ${entry.sourceLabel}${entry.location ? ` — ${entry.location}` : ""}**`,
    );

    if (entry.quote) {
      lines.push(`> "${entry.quote}"`);
    }

    if (entry.imageUrl) {
      lines.push("", `![Proof snippet](${entry.imageUrl})`);
    }

    lines.push("", "---", "");
  }

  lines.push("</details>");
  return lines.join("\n");
}
