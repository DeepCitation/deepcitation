import type React from "react";
import { getIndicator, toSuperscript } from "../../markdown/markdownVariants.js";
import { getCitationStatus } from "../../parsing/parseCitation.js";
import type { Citation } from "../../types/citation.js";
import type { Verification } from "../../types/verification.js";
import {
  DOC_CITATION_1,
  DOC_CITATION_2,
  DOC_CITATION_3,
  GITHUB_VARIANTS,
  NOT_FOUND_VERIFICATION,
  PARTIAL_VERIFICATION,
  PROOF_BASE_URL,
  RENDER_STATUS_TYPES,
  VERIFIED_VERIFICATION,
} from "./RenderTargetShowcase.constants.js";

// =============================================================================
// GITHUB OUTPUT SIMULATION
// =============================================================================

function githubBrackets(num: number, indicator: string, proofUrl: string): string {
  return `[[${num}${indicator}]](${proofUrl})`;
}

function githubSuperscript(num: number, indicator: string, proofUrl: string): string {
  return `[${toSuperscript(num)}${indicator}](${proofUrl})`;
}

function githubInline(anchorText: string, indicator: string, proofUrl: string): string {
  return `[${anchorText}${indicator}](${proofUrl})`;
}

function githubFootnote(num: number): string {
  return `[^${num}]`;
}

function getGitHubVariantOutput(variant: string, citation: Citation, indicator: string, proofUrl: string): string {
  const num = citation.citationNumber ?? 1;
  const anchor = citation.anchorText ?? "citation";
  switch (variant) {
    case "brackets":
      return githubBrackets(num, indicator, proofUrl);
    case "superscript":
      return githubSuperscript(num, indicator, proofUrl);
    case "inline":
      return githubInline(anchor, indicator, proofUrl);
    case "footnote":
      return githubFootnote(num);
    default:
      return githubBrackets(num, indicator, proofUrl);
  }
}

// =============================================================================
// GITHUB COMMENT CONTAINER
// =============================================================================

function GitHubComment({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
      <div className="bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-600 flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">deepcitation-bot</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">commented 2 hours ago</span>
      </div>
      <div className="p-4 text-sm text-gray-800 dark:text-gray-200">{children}</div>
    </div>
  );
}

function GitHubLink({ children }: { href: string; children: React.ReactNode }) {
  return <span className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">{children}</span>;
}

// =============================================================================
// GITHUB PREVIEW COMPONENT
// =============================================================================

export function GitHubPreview() {
  return (
    <div className="space-y-6">
      {/* Variants x Statuses Matrix */}
      <div data-testid="github-variants-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Variants x Statuses</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-2 text-gray-600 dark:text-gray-400">Variant</th>
                {RENDER_STATUS_TYPES.map(({ name }) => (
                  <th key={name} className="text-left p-2 text-gray-600 dark:text-gray-400">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GITHUB_VARIANTS.map(variant => (
                <tr
                  key={variant}
                  className="border-b border-gray-100 dark:border-gray-800"
                  data-github-variant={variant}
                >
                  <td className="p-2 font-mono text-gray-700 dark:text-gray-300 text-xs">{variant}</td>
                  {RENDER_STATUS_TYPES.map(({ name, verification, citation }) => {
                    const status = getCitationStatus(verification);
                    const indicator = getIndicator(status, "check");
                    const proofUrl = `${PROOF_BASE_URL}/p/${citation.attachmentId || "url"}`;
                    const output = getGitHubVariantOutput(variant, citation, indicator, proofUrl);
                    return (
                      <td key={name} className="p-2" data-github-status={name.toLowerCase().replace(" ", "-")}>
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-gray-800 dark:text-gray-200">
                          {output}
                        </code>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sources: Table Format */}
      <div data-testid="github-sources-table-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Sources — Table Format</h3>
        <GitHubComment>
          <GitHubDetailsPreview format="table" />
        </GitHubComment>
        <div className="mt-2">
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
            {githubSourcesTableRaw()}
          </pre>
        </div>
      </div>

      {/* Sources: Detailed Format */}
      <div data-testid="github-sources-detailed-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Sources — Detailed Format</h3>
        <GitHubComment>
          <GitHubDetailsPreview format="detailed" />
        </GitHubComment>
        <div className="mt-2">
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
            {githubSourcesDetailedRaw()}
          </pre>
        </div>
      </div>

      {/* Complete PR Comment */}
      <div data-testid="github-complete-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Complete PR Comment</h3>
        <GitHubComment>
          <div className="space-y-2">
            <p>
              The company reported strong growth.{" "}
              <GitHubCitationPreview
                variant="brackets"
                citation={DOC_CITATION_1}
                verification={VERIFIED_VERIFICATION}
              />{" "}
              Operating costs were reduced.{" "}
              <GitHubCitationPreview variant="brackets" citation={DOC_CITATION_2} verification={PARTIAL_VERIFICATION} />{" "}
              However, some projections remain unverified.{" "}
              <GitHubCitationPreview
                variant="brackets"
                citation={DOC_CITATION_3}
                verification={NOT_FOUND_VERIFICATION}
              />
            </p>
            <GitHubDetailsPreview format="table" />
          </div>
        </GitHubComment>
        <div className="mt-2">
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
            {completeGitHubRaw()}
          </pre>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function GitHubCitationPreview({
  variant,
  citation,
  verification,
}: {
  variant: string;
  citation: Citation;
  verification: Verification;
}) {
  const status = getCitationStatus(verification);
  const indicator = getIndicator(status, "check");
  const num = citation.citationNumber ?? 1;

  let displayText: string;
  switch (variant) {
    case "superscript":
      displayText = `${toSuperscript(num)}${indicator}`;
      break;
    case "inline":
      displayText = `${citation.anchorText ?? "citation"}${indicator}`;
      break;
    case "footnote":
      displayText = `^${num}`;
      break;
    default:
      displayText = `[${num}${indicator}]`;
      break;
  }

  return <GitHubLink href={`${PROOF_BASE_URL}/p/${(citation.type !== "url" && citation.attachmentId) || "url"}`}>{displayText}</GitHubLink>;
}

const SOURCES_DATA = [
  {
    num: 1,
    verification: VERIFIED_VERIFICATION,
    citation: DOC_CITATION_1,
    label: "Q4 Financial Report",
    statusLabel: "Verified",
  },
  {
    num: 2,
    verification: PARTIAL_VERIFICATION,
    citation: DOC_CITATION_2,
    label: "Q4 Financial Report",
    statusLabel: "Partial",
  },
  {
    num: 3,
    verification: NOT_FOUND_VERIFICATION,
    citation: DOC_CITATION_3,
    label: "Q4 Financial Report",
    statusLabel: "Not Found",
  },
] as const;

function GitHubDetailsPreview({ format }: { format: "table" | "detailed" }) {
  return (
    <details className="border border-gray-200 dark:border-gray-700 rounded p-2" open>
      <summary className="font-bold cursor-pointer text-sm">Sources (3)</summary>
      <div className="mt-2">{format === "table" ? <GitHubSourcesTable /> : <GitHubSourcesDetailed />}</div>
    </details>
  );
}

function GitHubSourcesTable() {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b border-gray-200 dark:border-gray-700">
          <th className="text-left p-1.5 text-gray-600 dark:text-gray-400">#</th>
          <th className="text-left p-1.5 text-gray-600 dark:text-gray-400">Status</th>
          <th className="text-left p-1.5 text-gray-600 dark:text-gray-400">Source</th>
          <th className="text-left p-1.5 text-gray-600 dark:text-gray-400">Location</th>
          <th className="text-left p-1.5 text-gray-600 dark:text-gray-400">Proof</th>
        </tr>
      </thead>
      <tbody>
        {SOURCES_DATA.map(({ num, verification, citation, label, statusLabel }) => {
          const status = getCitationStatus(verification);
          const indicator = getIndicator(status, "check");
          const page = verification.document?.verifiedPageNumber ?? (citation.type !== "url" ? citation.pageNumber : undefined) ?? 0;
          return (
            <tr key={num} className="border-b border-gray-100 dark:border-gray-800">
              <td className="p-1.5">{num}</td>
              <td className="p-1.5">
                {indicator} {statusLabel}
              </td>
              <td className="p-1.5">{label}</td>
              <td className="p-1.5">p.{page}</td>
              <td className="p-1.5">
                <GitHubLink href={`${PROOF_BASE_URL}/p/proof${num}`}>View proof</GitHubLink>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GitHubSourcesDetailed() {
  return (
    <div className="space-y-3">
      {SOURCES_DATA.map(({ num, verification, citation, label }) => {
        const status = getCitationStatus(verification);
        const indicator = getIndicator(status, "check");
        const page = verification.document?.verifiedPageNumber ?? (citation.type !== "url" ? citation.pageNumber : undefined) ?? 0;
        return (
          <div key={num}>
            <p className="font-bold text-xs">
              [{num}
              {indicator}] {label} — p.{page}
            </p>
            <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-3 my-1 text-xs text-gray-600 dark:text-gray-400 italic">
              "{citation.fullPhrase}"
            </blockquote>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              ![Proof snippet]({PROOF_BASE_URL}/p/proof{num}?format=png&view=snippet)
            </p>
            {num < SOURCES_DATA.length && <hr className="border-gray-200 dark:border-gray-700 mt-2" />}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// RAW OUTPUT STRINGS
// =============================================================================

function githubSourcesTableRaw(): string {
  const lines = [
    "<details>",
    "<summary><b>Sources (3)</b></summary>",
    "<br>",
    "",
    "| # | Status | Source | Location | Proof |",
    "|---|--------|--------|----------|-------|",
  ];
  for (const { num, verification, citation, label, statusLabel } of SOURCES_DATA) {
    const status = getCitationStatus(verification);
    const indicator = getIndicator(status, "check");
    const page = verification.document?.verifiedPageNumber ?? (citation.type !== "url" ? citation.pageNumber : undefined) ?? 0;
    lines.push(
      `| ${num} | ${indicator} ${statusLabel} | ${label} | p.${page} | [View proof](${PROOF_BASE_URL}/p/proof${num}) |`,
    );
  }
  lines.push("", "</details>");
  return lines.join("\n");
}

function githubSourcesDetailedRaw(): string {
  const lines = ["<details>", "<summary><b>Sources (3)</b></summary>", "<br>", ""];
  for (const { num, verification, citation, label } of SOURCES_DATA) {
    const status = getCitationStatus(verification);
    const indicator = getIndicator(status, "check");
    const page = verification.document?.verifiedPageNumber ?? (citation.type !== "url" ? citation.pageNumber : undefined) ?? 0;
    lines.push(`**[${num}${indicator}] ${label} — p.${page}**`);
    lines.push(`> "${citation.fullPhrase}"`);
    lines.push("");
    lines.push(`![Proof snippet](${PROOF_BASE_URL}/p/proof${num}?format=png&view=snippet)`);
    if (num < SOURCES_DATA.length) {
      lines.push("");
      lines.push("---");
    }
    lines.push("");
  }
  lines.push("</details>");
  return lines.join("\n");
}

function completeGitHubRaw(): string {
  const v1 = getCitationStatus(VERIFIED_VERIFICATION);
  const v2 = getCitationStatus(PARTIAL_VERIFICATION);
  const v3 = getCitationStatus(NOT_FOUND_VERIFICATION);
  const i1 = getIndicator(v1, "check");
  const i2 = getIndicator(v2, "check");
  const i3 = getIndicator(v3, "check");

  const lines = [
    `The company reported strong growth. [[1${i1}]](${PROOF_BASE_URL}/p/abc123) Operating costs were reduced. [[2${i2}]](${PROOF_BASE_URL}/p/abc123) However, some projections remain unverified. [[3${i3}]](${PROOF_BASE_URL}/p/abc123)`,
    "",
    githubSourcesTableRaw(),
  ];
  return lines.join("\n");
}
