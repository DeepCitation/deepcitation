import type React from "react";
import { getIndicator } from "../../markdown/markdownVariants.js";
import { getCitationStatus } from "../../parsing/parseCitation.js";
import type { CitationStatus } from "../../types/citation.js";
import {
  DOC_CITATION_1,
  DOC_CITATION_2,
  DOC_CITATION_3,
  NOT_FOUND_VERIFICATION,
  PARTIAL_VERIFICATION,
  RENDER_STATUS_TYPES,
  TERMINAL_VARIANTS,
  VERIFIED_VERIFICATION,
} from "./RenderTargetShowcase.constants.js";

// =============================================================================
// TERMINAL COLOR SIMULATION
// =============================================================================

const STATUS_TEXT_CLASS: Record<string, string> = {
  verified: "text-green-500",
  partial: "text-amber-500",
  notFound: "text-red-500",
  pending: "text-gray-400",
};

function getStatusColorClass(status: CitationStatus): string {
  if (status.isMiss) return STATUS_TEXT_CLASS.notFound;
  if (status.isPartialMatch) return STATUS_TEXT_CLASS.partial;
  if (status.isVerified) return STATUS_TEXT_CLASS.verified;
  return STATUS_TEXT_CLASS.pending;
}

function getStatusKey(status: CitationStatus): string {
  if (status.isMiss) return "not-found";
  if (status.isPartialMatch) return "partial";
  if (status.isVerified) return "verified";
  return "pending";
}

// =============================================================================
// TERMINAL CONTAINER
// =============================================================================

function TerminalWindow({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-950 rounded-lg overflow-hidden border border-gray-700">
      <div className="bg-gray-800 px-4 py-2 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <span className="text-xs text-gray-400 ml-2 font-mono">{title ?? "terminal"}</span>
      </div>
      <div className="p-4 font-mono text-sm text-gray-300 leading-relaxed">{children}</div>
    </div>
  );
}

// =============================================================================
// TERMINAL PREVIEW COMPONENT
// =============================================================================

export function TerminalPreview() {
  return (
    <div className="space-y-6">
      {/* Variants x Statuses Matrix */}
      <div data-testid="terminal-variants-section">
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
              {TERMINAL_VARIANTS.map(variant => (
                <tr
                  key={variant}
                  className="border-b border-gray-100 dark:border-gray-800"
                  data-terminal-variant={variant}
                >
                  <td className="p-2 font-mono text-gray-700 dark:text-gray-300 text-xs">{variant}</td>
                  {RENDER_STATUS_TYPES.map(({ name, verification, citation }) => {
                    const status = getCitationStatus(verification);
                    const colorClass = getStatusColorClass(status);
                    const indicator = getIndicator(status, "check");
                    const num = citation.citationNumber ?? 1;
                    const anchor = citation.anchorText ?? "citation";

                    let display: React.ReactNode;
                    switch (variant) {
                      case "inline":
                        display = (
                          <span className={colorClass}>
                            {anchor}
                            {indicator}
                          </span>
                        );
                        break;
                      case "minimal":
                        display = <span className={colorClass}>{indicator}</span>;
                        break;
                      default:
                        display = (
                          <span className={colorClass}>
                            [{num}
                            {indicator}]
                          </span>
                        );
                        break;
                    }

                    return (
                      <td
                        key={name}
                        className="p-2 font-mono bg-gray-950 text-gray-300"
                        data-terminal-status={name.toLowerCase().replace(" ", "-")}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ANSI Color Simulation */}
      <div data-testid="terminal-colors-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">ANSI Color Simulation</h3>
        <TerminalWindow title="ansi-colors">
          <div className="space-y-1">
            {RENDER_STATUS_TYPES.map(({ name, verification, citation }) => {
              const status = getCitationStatus(verification);
              const colorClass = getStatusColorClass(status);
              const indicator = getIndicator(status, "check");
              const num = citation.citationNumber ?? 1;
              const statusKey = getStatusKey(status);
              return (
                <div key={name} data-terminal-status={statusKey}>
                  <span className="text-gray-300">{citation.fullPhrase} </span>
                  <span className={colorClass}>
                    [{num}
                    {indicator}]
                  </span>
                  <span className="text-gray-500 ml-4">
                    {"  ← "}
                    {name.toLowerCase()}
                  </span>
                </div>
              );
            })}
          </div>
        </TerminalWindow>
      </div>

      {/* Sources Section with Box-Drawing */}
      <div data-testid="terminal-sources-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Sources Section</h3>
        <TerminalWindow title="sources">
          <TerminalSourcesDisplay />
        </TerminalWindow>
        <div className="mt-2">
          <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200">
            {terminalSourcesRaw()}
          </pre>
        </div>
      </div>

      {/* Complete Terminal Output */}
      <div data-testid="terminal-complete-section">
        <h3 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">Complete Output</h3>
        <TerminalWindow title="deepcitation-cli">
          <TerminalCompleteDisplay />
        </TerminalWindow>
      </div>
    </div>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

const SOURCES = [
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
    statusLabel: "Partial (found on other page)",
  },
  {
    num: 3,
    verification: NOT_FOUND_VERIFICATION,
    citation: DOC_CITATION_3,
    label: "Q4 Financial Report",
    statusLabel: "Not found in source document",
  },
] as const;

function TerminalSourcesDisplay() {
  return (
    <div>
      <div className="text-gray-400">{"─── Sources ────────────────────────────────────"}</div>
      {SOURCES.map(({ num, verification, citation, statusLabel }) => {
        const status = getCitationStatus(verification);
        const colorClass = getStatusColorClass(status);
        const indicator = getIndicator(status, "check");
        const page = verification.verifiedPageNumber ?? citation.pageNumber ?? 0;
        return (
          <div key={num} className="ml-1">
            <div>
              <span className={colorClass}>
                {" "}
                [{num}] {indicator}
              </span>
              <span className="text-gray-300">
                {" "}
                {citation.attachmentId ? `Q4 Financial Report — p.${page}` : statusLabel}
              </span>
            </div>
            <div className="ml-5 text-gray-500">
              {status.isMiss ? "Not found in source document" : `"${citation.fullPhrase}"`}
            </div>
          </div>
        );
      })}
      <div className="text-gray-400">{"────────────────────────────────────────────────"}</div>
    </div>
  );
}

function TerminalCompleteDisplay() {
  const v1 = getCitationStatus(VERIFIED_VERIFICATION);
  const v2 = getCitationStatus(PARTIAL_VERIFICATION);
  const v3 = getCitationStatus(NOT_FOUND_VERIFICATION);

  const c1 = getStatusColorClass(v1);
  const c2 = getStatusColorClass(v2);
  const c3 = getStatusColorClass(v3);

  const i1 = getIndicator(v1, "check");
  const i2 = getIndicator(v2, "check");
  const i3 = getIndicator(v3, "check");

  return (
    <div className="space-y-3">
      <div>
        <span className="text-gray-300">The company reported strong growth. </span>
        <span className={c1}>[1{i1}]</span>
        <span className="text-gray-300"> Operating costs were reduced. </span>
        <span className={c2}>[2{i2}]</span>
        <span className="text-gray-300"> However, some projections remain unverified. </span>
        <span className={c3}>[3{i3}]</span>
      </div>
      <div />
      <TerminalSourcesDisplay />
    </div>
  );
}

// =============================================================================
// RAW OUTPUT STRINGS
// =============================================================================

function terminalSourcesRaw(): string {
  const lines = ["─── Sources ────────────────────────────────────"];
  for (const { num, verification, citation } of SOURCES) {
    const status = getCitationStatus(verification);
    const indicator = getIndicator(status, "check");
    const page = verification.verifiedPageNumber ?? citation.pageNumber ?? 0;
    lines.push(` [${num}] ${indicator} Q4 Financial Report — p.${page}`);
    if (status.isMiss) {
      lines.push(`     Not found in source document`);
    } else {
      lines.push(`     "${citation.fullPhrase}"`);
    }
  }
  lines.push("────────────────────────────────────────────────");
  return lines.join("\n");
}
